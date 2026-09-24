# Agent Guidelines for Cubeaway

## Mandatory Git Synchronization & Deployment Rule
Alla kodförändringar i detta projekt ska ALLTID hållas 100 % identiska lokalt och på Git (origin/main).
Synkronisering ska göras LÖPANDE efter varje enskild förändring eller delmoment.

GitHub Actions publicerar automatiskt till GitHub Pages: https://fredrikbeckman69-alt.github.io/cubeaway/

Efter varje kodändring, justering eller ny funktion:
1. Kör alltid build-test: `npm run build`
2. Gör git commit och push till origin main:
   ```bash
   git add .
   git commit -m '<beskrivande ändring>'
   git push origin main
   ```
3. Verifiera att arbetsytan är helt ren och synkad:
   ```bash
   git status
   ```
   *(Ska bekräfta: `Your branch is up to date with 'origin/main'` och `nothing to commit, working tree clean`)*
