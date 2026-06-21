Drop the backup Hindi clip(s) here for live-demo insurance (§11).

Required format: raw 16-bit PCM, mono, 16kHz (`.pcm`), matching what the
browser mic client streams. Convert a normal recording with ffmpeg:

    ffmpeg -i my-clip.wav -f s16le -ar 16000 -ac 1 backup-hindi-sample.pcm

Default expected filename: `backup-hindi-sample.pcm` (see `.env` ->
`BACKUP_AUDIO_PATH`). You can also pass a specific filename at runtime via
the `useBackupClip` WS message.
