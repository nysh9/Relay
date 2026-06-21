// ─── useRelayLive — drives the Figma UI from the REAL backend ────────────────
// Replaces App.tsx's scripted timeline with the live pipeline:
//
//   mic (PCM16/16kHz) ──▶ Ear WS (:8080, Deepgram) ──▶ final_transcript
//        ──▶ POST /api/triage (Brain :4001 — Claude + Redis memory + classifier)
//        ──▶ when readyToRoute: POST /api/dispatch (Matchmaker :3002 — Redis
//            vector search) ──▶ map + dispatch card.
//
// It exposes state in the exact shapes App.tsx's components already render, so
// the Figma look is untouched — only the data is now real.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from 'react'

// Ear WebSocket (live transcript). Overridable for non-default setups.
const EAR_WS_URL =
  (import.meta as { env?: Record<string, string> }).env?.VITE_EAR_WS_URL ??
  'ws://localhost:8080'

// ── Shapes coming back from the backend ──────────────────────────────────────
interface WireTranscript {
  sessionId: string
  text: string
  isFinal: boolean
  confidence: number
  language: string
  timestamp: number
}
interface EarMsg {
  type: string
  sessionId?: string
  transcript?: WireTranscript
  message?: string
  repromptMessage?: string
  escalate?: string
  escalationReason?: string
}
interface BrainTriage {
  summary: string
  transcriptEnglish: string
  people: number | null
  injuries: string | null
  location: { text: string; lat?: number; lng?: number } | null
  needs: string[]
  priority: 'P1' | 'P2' | 'P3'
  missingFields: string[]
  nextQuestion: string | null
  nextQuestionEnglish: string | null
  readyToRoute: boolean
  escalate: 'none' | 'human' | '911'
}
interface MatchResource {
  id: string
  name: string
  type: string
  lat: number
  lng: number
  capacity: number
  availableCapacity: number
  has: string[]
  address: string
  phone?: string
}
interface DispatchResp {
  sessionId: string
  matchedResource: MatchResource | null
  dispatchText: string
  distanceKm: number | null
  callerLatLng: [number, number] | null
  candidates: MatchResource[]
  timestamp: number
}

// ── Shapes the Figma UI renders ──────────────────────────────────────────────
export type ResourceType = 'shelter' | 'medical' | 'water'
export interface UiResource {
  id: string
  name: string
  type: ResourceType
  lat: number
  lng: number
  capacity: number
  remaining: number
  address: string
  has: string[]
  distanceKm: number
  driveMin: number
  note: string
}
export interface Turn {
  speaker: 'caller' | 'relay'
  text: string
  translation?: string
}
export interface TriageData {
  people?: string
  medical?: string
  needs?: string
  location?: string
  danger?: string
}
export type Stage = 'ringing' | 'listening' | 'matched'

// ── helpers ──────────────────────────────────────────────────────────────────
function hkm(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 6371,
    dl = ((la2 - la1) * Math.PI) / 180,
    dg = ((lo2 - lo1) * Math.PI) / 180
  const a =
    Math.sin(dl / 2) ** 2 +
    Math.cos((la1 * Math.PI) / 180) * Math.cos((la2 * Math.PI) / 180) * Math.sin(dg / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10
}

// Matchmaker resource types → the 3 icon buckets the Figma map/legend use.
function figmaType(t: string): ResourceType {
  if (t === 'medical') return 'medical'
  if (t === 'distribution') return 'water' // supplies/water drive-through
  return 'shelter' // shelter + evacuation
}

function float32ToPcm16(float32: Float32Array): Int16Array {
  const pcm = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return pcm
}

function toUiResource(r: MatchResource, caller: [number, number] | null): UiResource {
  const km = caller ? hkm(caller[0], caller[1], r.lat, r.lng) : 0
  return {
    id: r.id,
    name: r.name,
    type: figmaType(r.type),
    lat: r.lat,
    lng: r.lng,
    capacity: r.capacity,
    remaining: r.availableCapacity,
    address: r.address,
    has: r.has,
    distanceKm: km,
    driveMin: Math.max(1, Math.round((km / 28) * 60)),
    note: `${r.availableCapacity} open · ${r.has.slice(0, 3).join(', ')}`,
  }
}

function toTriageData(t: BrainTriage): TriageData {
  const d: TriageData = {}
  if (t.people != null) d.people = `${t.people} ${t.people === 1 ? 'person' : 'people'}`
  if (t.needs?.length) d.needs = t.needs.join(' · ')
  if (t.location?.text) d.location = t.location.text
  if (t.injuries) d.medical = t.injuries
  else if (t.readyToRoute) d.medical = 'No injuries reported'
  if (t.escalate === '911') d.danger = 'Escalated to 911 — active emergency'
  else if (t.escalate === 'human') d.danger = 'Escalated to a human operator'
  else if (t.priority === 'P1') d.danger = 'High urgency — time-sensitive'
  return d
}

const LANG_NAME: Record<string, string> = {
  hi: 'Hindi',
  es: 'Spanish',
  en: 'English',
  fr: 'French',
  pt: 'Portuguese',
  ar: 'Arabic',
  zh: 'Chinese',
}

// ── Voice-back (TTS) ─────────────────────────────────────────────────────────
// RELAY speaks its follow-up questions aloud. Primary path: Deepgram Aura via the
// Next app's /api/speak route (en/es), proxied by Vite. For languages Deepgram
// doesn't voice (e.g. Hindi → 415) or if /api/speak is unreachable, we fall back
// to the browser's built-in SpeechSynthesis so it ALWAYS speaks.
let currentAudio: HTMLAudioElement | null = null

function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel()
  } catch {
    /* no-op */
  }
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
}

async function speakText(text: string, language: string) {
  if (!text) return
  stopSpeaking()
  try {
    const res = await fetch('/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language }),
    })
    const ct = res.headers.get('content-type') ?? ''
    if (res.ok && ct.includes('audio')) {
      const url = URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: 'audio/mpeg' }))
      const audio = new Audio(url)
      currentAudio = audio
      audio.onended = () => URL.revokeObjectURL(url)
      await audio.play()
      return
    }
  } catch {
    /* fall through to the browser voice */
  }
  // Deepgram unsupported (415) or /api/speak unreachable → browser SpeechSynthesis.
  try {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = language || 'en-US'
    window.speechSynthesis?.speak(u)
  } catch {
    /* no TTS available in this browser */
  }
}

export interface RelayLive {
  stage: Stage
  turns: Turn[]
  speaking: boolean
  triage: TriageData
  brainVisible: boolean
  priority: 'P1' | 'P2' | 'P3'
  agentSteps: string[]
  resources: UiResource[]
  matches: UiResource[]
  selectedId: string | null
  callerLatLng: [number, number] | null
  detectedLanguage: string
  micError: string | null
  setSelectedId: (id: string | null) => void
  startCall: () => Promise<void>
  endCall: () => void
}

export function useRelayLive(): RelayLive {
  const [stage, setStage] = useState<Stage>('ringing')
  const [turns, setTurns] = useState<Turn[]>([])
  const [speaking, setSpeaking] = useState(false)
  const [triage, setTriage] = useState<TriageData>({})
  const [brainVisible, setBrainVisible] = useState(false)
  const [priority, setPriority] = useState<'P1' | 'P2' | 'P3'>('P2')
  const [agentSteps, setAgentSteps] = useState<string[]>(['Waiting for incoming call…'])
  const [resources, setResources] = useState<UiResource[]>([])
  const [matches, setMatches] = useState<UiResource[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [callerLatLng, setCallerLatLng] = useState<[number, number] | null>(null)
  const [detectedLanguage, setDetectedLanguage] = useState('—')
  const [micError, setMicError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const sessionIdRef = useRef<string>('')
  const langRef = useRef<string>('hi')

  // mic refs
  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const procRef = useRef<ScriptProcessorNode | null>(null)

  const pushStep = useCallback((s: string) => {
    setAgentSteps((prev) => (prev.length === 1 && prev[0].startsWith('Waiting') ? [s] : [...prev, s]))
  }, [])

  // ── Brain + Matchmaker calls ───────────────────────────────────────────────
  const runDispatch = useCallback(async (t: BrainTriage) => {
    pushStep('Matchmaker · Redis vector search…')
    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...t, sessionId: sessionIdRef.current }),
      })
      if (!res.ok) {
        pushStep(`Matchmaker error (${res.status})`)
        return
      }
      const d = (await res.json()) as DispatchResp
      const caller = d.callerLatLng ?? (t.location?.lat && t.location?.lng ? [t.location.lat, t.location.lng] : null)
      setCallerLatLng(caller)
      const all = [d.matchedResource, ...d.candidates].filter(Boolean) as MatchResource[]
      const ui = all.map((r) => toUiResource(r, caller))
      setResources(ui)
      setMatches(ui)
      if (d.matchedResource) {
        setSelectedId(d.matchedResource.id)
        const km = d.distanceKm != null ? d.distanceKm : ui[0]?.distanceKm
        pushStep(`Match: ${d.matchedResource.name} · ${km} km · ${d.matchedResource.availableCapacity} open`)
      }
      pushStep('Dispatch issued → human operator notified ✓')
      setStage('matched')
    } catch (err) {
      pushStep('Matchmaker unreachable')
      console.error('[relay] dispatch failed', err)
    }
  }, [pushStep])

  const runTriage = useCallback(
    async (wt: WireTranscript) => {
      const langName = LANG_NAME[(wt.language || 'hi').split('-')[0]] ?? wt.language
      setDetectedLanguage(langName)
      pushStep(`Language detected: ${langName} · conf ${wt.confidence.toFixed(2)}`)

      // Add the caller's turn immediately (translation fills in after Claude).
      setTurns((prev) => [...prev, { speaker: 'caller', text: wt.text }])

      try {
        const res = await fetch('/api/triage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: wt.text, sessionId: sessionIdRef.current, language: wt.language }),
        })
        if (!res.ok) {
          pushStep(`Brain error (${res.status})`)
          return
        }
        const data = (await res.json()) as { triage: BrainTriage }
        const t = data.triage

        // Backfill the caller bubble's English translation.
        setTurns((prev) => {
          const copy = [...prev]
          for (let i = copy.length - 1; i >= 0; i--) {
            if (copy[i].speaker === 'caller' && !copy[i].translation) {
              copy[i] = { ...copy[i], translation: t.transcriptEnglish }
              break
            }
          }
          return copy
        })

        setTriage(toTriageData(t))
        setPriority(t.priority)
        setBrainVisible(true)
        pushStep(`Claude triage · needs=[${t.needs.join(', ')}]${t.people != null ? ` · people=${t.people}` : ''}`)
        if (t.location?.text) pushStep(`Location: ${t.location.text}`)

        if (t.readyToRoute) {
          await runDispatch(t)
        } else if (t.nextQuestionEnglish || t.nextQuestion) {
          // RELAY asks the follow-up: shown to the operator in English, and
          // spoken aloud in the CALLER's language (Deepgram, browser fallback).
          setTurns((prev) => [...prev, { speaker: 'relay', text: t.nextQuestionEnglish ?? t.nextQuestion ?? '' }])
          void speakText(t.nextQuestion ?? t.nextQuestionEnglish ?? '', wt.language)
        }
      } catch (err) {
        pushStep('Brain unreachable')
        console.error('[relay] triage failed', err)
      }
    },
    [pushStep, runDispatch]
  )

  // ── WebSocket handling ─────────────────────────────────────────────────────
  const handleEarMessage = useCallback(
    (msg: EarMsg) => {
      switch (msg.type) {
        case 'session_start':
          if (msg.sessionId) sessionIdRef.current = msg.sessionId
          pushStep('Deepgram STT connected · streaming audio…')
          break
        case 'interim_transcript':
          setSpeaking(true)
          break
        case 'final_transcript':
          setSpeaking(false)
          if (msg.transcript) {
            langRef.current = msg.transcript.language || langRef.current
            void runTriage(msg.transcript)
          }
          break
        case 'reprompt':
          setSpeaking(false)
          setTurns((prev) => [
            ...prev,
            { speaker: 'relay', text: msg.repromptMessage ?? "I didn't catch that, can you repeat?" },
          ])
          break
        case 'escalation':
          setTriage((prev) => ({
            ...prev,
            danger: msg.escalate === '911' ? 'Escalated to 911' : 'Escalated to a human operator',
          }))
          break
        default:
          break
      }
    },
    [pushStep, runTriage]
  )

  // ── Mic ────────────────────────────────────────────────────────────────────
  const startMic = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
    })
    streamRef.current = stream
    const ctx = new AudioContext({ sampleRate: 16000 })
    ctxRef.current = ctx
    const source = ctx.createMediaStreamSource(stream)
    const processor = ctx.createScriptProcessor(4096, 1, 1)
    procRef.current = processor
    processor.onaudioprocess = (e) => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      const pcm16 = float32ToPcm16(e.inputBuffer.getChannelData(0))
      ws.send(pcm16.buffer)
    }
    source.connect(processor)
    processor.connect(ctx.destination)
  }, [])

  const stopMic = useCallback(() => {
    procRef.current?.disconnect()
    procRef.current = null
    ctxRef.current?.close().catch(() => {})
    ctxRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  // ── Public controls ────────────────────────────────────────────────────────
  const startCall = useCallback(async () => {
    // reset
    setTurns([])
    setTriage({})
    setBrainVisible(false)
    setSelectedId(null)
    setResources([])
    setMatches([])
    setCallerLatLng(null)
    setSpeaking(false)
    setMicError(null)
    setAgentSteps(['Connecting to the Ear…'])
    setStage('listening')

    try {
      await startMic()
    } catch (err) {
      setMicError('Microphone permission denied or unavailable.')
      pushStep('Mic unavailable — check browser permissions')
      console.error('[relay] mic failed', err)
      return
    }

    const ws = new WebSocket(EAR_WS_URL)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws
    ws.onopen = () => ws.send(JSON.stringify({ type: 'session_start' }))
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return // Ear only sends JSON text to client
      try {
        handleEarMessage(JSON.parse(ev.data) as EarMsg)
      } catch {
        /* ignore malformed */
      }
    }
    ws.onerror = () => pushStep('Ear connection error (is the server on :8080 up?)')
  }, [handleEarMessage, pushStep, startMic])

  const endCall = useCallback(() => {
    stopSpeaking()
    try {
      wsRef.current?.send(JSON.stringify({ type: 'session_end' }))
    } catch {
      /* ignore */
    }
    wsRef.current?.close()
    wsRef.current = null
    stopMic()
    sessionIdRef.current = ''
    setStage('ringing')
    setTurns([])
    setTriage({})
    setBrainVisible(false)
    setSelectedId(null)
    setResources([])
    setMatches([])
    setCallerLatLng(null)
    setSpeaking(false)
    setDetectedLanguage('—')
    setAgentSteps(['Waiting for incoming call…'])
  }, [stopMic])

  return {
    stage,
    turns,
    speaking,
    triage,
    brainVisible,
    priority,
    agentSteps,
    resources,
    matches,
    selectedId,
    callerLatLng,
    detectedLanguage,
    micError,
    setSelectedId,
    startCall,
    endCall,
  }
}
