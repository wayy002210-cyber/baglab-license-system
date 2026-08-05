# FFmpeg runtime binaries

Place self-contained Windows x64 builds of `ffmpeg.exe` and `ffprobe.exe` in
this directory before creating a release. `scripts/prepare-runtime.mjs` gives
these binaries priority over a machine-wide FFmpeg installation so the Windows
installer remains self-contained. The executable binaries are intentionally
not stored in Git; release builders provide them through this directory or the
`AUTOCUT_FFMPEG_DIR` environment variable.
