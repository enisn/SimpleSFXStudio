# Project Notes

- Theme support is mandatory for all user-facing UI in this repo.
- Every new drawer, popup, modal, floating control, and overlay must work in both light and dark themes.
- Prefer existing theme tokens from `src/index.css`. If a new surface needs custom colors, add CSS variables in both `:root` and `:root[data-theme='dark']` instead of hardcoding an always-dark or always-light palette.
- Before finishing UI work, verify both theme modes and confirm overlay layouts do not overflow on narrow/mobile viewports.
