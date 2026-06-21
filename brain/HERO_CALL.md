# RELAY — Hero Call Script
Houston hurricane/flood scenario. 3 turns. Hindi caller → English triage output.

---

## The Scenario
Family of 5 stranded in Kashmere Gardens during a flood. No food, no water, elderly grandmother, three children.

---

## Turn 1 — Panicked opener (triggers: location + people follow-up)
**Hindi (caller says):**
> हमें मदद चाहिए! तूफान की वजह से हमारे घर में पानी घुस आया है। हमारे पास खाना और पानी बिल्कुल नहीं है और हम फँसे हुए हैं।

**English translation:**
"We need help! Because of the hurricane water has entered our house. We have absolutely no food or water and we are trapped."

**Expected output:**
- `needs: ["water", "food"]`
- `priority: "P1"`
- `location: null` → `nextQuestion` asks for location
- `people: null`
- `readyToRoute: false`
- `escalate: "none"`

---

## Turn 2 — Answers location (triggers: people follow-up)
**Hindi (caller says):**
> हम Kashmere Gardens में हैं, Kelley Street के पास। तूफान के बाद से फँसे हुए हैं।

**English translation:**
"We are in Kashmere Gardens, near Kelley Street. We've been stuck since the hurricane."

**Expected output:**
- `location: { text: "Kashmere Gardens, near Kelley Street" }`
- `people: null` → `nextQuestion` asks how many people
- `readyToRoute: false`
- `escalate: "none"`

---

## Turn 3 — Gives people count (triggers: readyToRoute)
**Hindi (caller says):**
> हम पाँच लोग हैं — तीन बच्चे, एक बुजुर्ग दादी और मैं।

**English translation:**
"There are five of us — three children, an elderly grandmother and me."

**Expected output:**
- `people: 5`
- `missingFields: []`
- `nextQuestion: null`
- `readyToRoute: true`
- `escalate: "none"`
- `priority: "P1"` (elderly + children + no water/food)

---

## Demo talking points
- Turn 1 → Turn 2: "RELAY understood the Hindi, extracted the needs, and asked where they are — no translator needed"
- Turn 2 → Turn 3: "It remembered the water and food needs from the first message — it's building a picture across the conversation"
- Turn 3: "All slots filled — handing off to the routing engine"
- Map lights up: "Family of 5, Kashmere Gardens → [Shelter Name], [X]km, has water and food"
