# CubeAway Project Skills & Workflows

## Regel: Omedelbar Git-Deploy vid Kodförändringar
**Alla kodförändringar i detta projekt SKA omedelbart committas och pushas/deployas till Git och GitHub Pages.**

### Arbetsflöde vid kodändring:
1. När ändringar i källkod (src/, index.html, etc.) eller konfiguration har gjorts och verifierats (npm run build passerar utan fel):
2. Kör omedelbart:
   git add .
   git commit -m '<beskrivande meddelande om ändringen>'
   git push origin main

3. GitHub Actions-arbetsflödet (.github/workflows/deploy.yml) triggas automatiskt vid varje push till main och bygger samt publicerar den uppdaterade versionen till GitHub Pages:
   - Live URL: https://fredrikbeckman69-alt.github.io/cubeaway/
   - Repo: https://github.com/fredrikbeckman69-alt/cubeaway

### Regler för agenter och utvecklare:
- Lämna aldrig ändringar osparade eller ocommittade i repot efter att ett användarönskemål eller en ändring har slutförts.
- Se till att npm run build lyckas innan push så att GitHub Actions-bygget alltid går grönt.
