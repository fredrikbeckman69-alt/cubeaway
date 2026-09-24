# CubeAway Project Skills & Workflows

## Regel: Löpande och Omedelbar Git-Synkronisering
**Koden ska ALLTID vara 100 % identisk lokalt och på Git (origin/main). Detta SKA göras löpande vid varje enskild kodförändring och delmoment.**

Inga ändringar får någonsin lämnas opushade, osynkade eller liggande lokalt efter att ett delsteg eller önskemål utförts.

---

### Löpande arbetsflöde:
1. **Inför varje session / arbete:**
   - Kontrollera att arbetsytan är ren och synkad:
     ```bash
     git status
     git fetch origin
     ```
2. **Vid VARJE kodändring, justering eller ny funktion (löpande):**
   - Testa alltid bygget först:
     ```bash
     npm run build
     ```
   - Committa och pusha omedelbart till `main`:
     ```bash
     git add .
     git commit -m '<beskrivande meddelande om ändringen>'
     git push origin main
     ```
   - Verifiera att status är helt ren:
     ```bash
     git status
     ```
     *(Ska visa: `Your branch is up to date with 'origin/main'` och `nothing to commit, working tree clean`)*

3. **Automatisk publicering via GitHub Actions:**
   - Varje push till `main` triggar automatisk byggnation och publicering till GitHub Pages:
     - **Live URL:** https://fredrikbeckman69-alt.github.io/cubeaway/
     - **GitHub Repo:** https://github.com/fredrikbeckman69-alt/cubeaway

---

### Strikt regel för agenter:
* Alla förändringar ska omedelbart speglas på Git så att den senaste koden ALLTID är densamma lokalt som i repot.
* Ingen förändring betraktas som slutförd förrän koden har byggts, committats och pushats till `origin main`.
