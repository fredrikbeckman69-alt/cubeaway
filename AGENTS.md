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

## Failsafe mot Dimensionsregressioner & Strikt Låsta HUD-placeholders
* **Nivåbrickan (`.level-badge`) och centrala HUD-placeholders ska ha STRIKT LÅST BREDD:**
  - `width`, `min-width` och `max-width` ska ALLTID vara låsta till samma fasta mått (`330px` på desktop, `280px` på surfplatta/mobil) med `flex-shrink: 0` och `box-sizing: border-box`.
  - Elementet får **ALDRIG** tillåtas ändra storlek i sidled, hoppa eller flyta vid text- eller nivåbyten.
  - Texten inuti ska alltid trunkeras med `overflow: hidden; text-overflow: ellipsis; min-width: 0;` så att den aldrig trycker ut eller ändrar brickans dimensioner.
* **Absolut förbud mot dimensionsregressioner:** Tidigare godkända låsta dimensioner får **ALDRIG** ändras tillbaka till flytande mått (`width: auto`, flexibla intervall eller dynamisk anpassning i sidled).

## Strikt Regel: Inga Kodförändringar Utan Uttryckligt Medgivande
* **Inga förändringar i koden får ske utan användarens uttryckliga medgivande.**
* Agenter får ALDRIG göra oombedda refaktoriseringar, "städningar", spontana designomgörningar eller ändringar i fungerande logik utan att användaren uttryckligen har instruerat eller godkänt det.

