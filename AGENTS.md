# Agent Guidelines for Cubeaway

## Mandatory Git Deployment Rule
Alla kodförändringar i detta projekt ska omedelbart committas och deployas (pushas) till Git-repot (branch: main).
GitHub Actions publicerar automatiskt till GitHub Pages: https://fredrikbeckman69-alt.github.io/cubeaway/

Efter varje kodändring eller ny funktion:
1. Kör alltid build-test: npm run build
2. Gör git commit och push till origin main:
   git add .
   git commit -m '<beskrivande ändring>'
   git push origin main
