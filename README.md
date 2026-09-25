# Music Bingo

A browser-based Music Bingo party game with a host console, individual player cards, and a big-screen visualizer. The app synchronizes the room through Firebase and uses short iTunes preview clips for the music.

## Play

The hosted game is available at [jeremy-c-white.github.io/Music-Bingo](https://jeremy-c-white.github.io/Music-Bingo/).

- **Host & Caller:** start or reset a round, call tracks, control Auto-Caller, follow the talk track, and review bingo claims.
- **Player Card:** enter a name, receive a randomized card, mark songs, send reactions, and call bingo.
- **Stage Visuals:** project the current track, timer, winner moments, and room reactions. Keep this page unmuted if it should provide the room audio.

For the cleanest sound, use one browser tab for room audio. The host console automatically mutes its preview while the visualizer is actively playing.

## Run locally

Requires Node.js 22 or newer.

```bash
npm ci
npm run dev
```

Open the local address shown in the terminal. No API key or local environment file is required.

## Quality checks

```bash
npm run lint
npm run build
```

Pushes to `main` are built and deployed to GitHub Pages by the included workflow.
