Cauta Pret cu backend

Aplicatie PWA pentru Android: cauti produsul si vezi pretul din catalogul Linella.
Cu server.py poti actualiza preturile direct din telefon, prin butonul Actualizeaza.

Pornire pe calculator:
1. Deschide PowerShell.
2. Ruleaza:
   cd "C:\Users\timbu\Documents\Codex\2026-06-06\poti-crea-o-aplicatie-cin-da\outputs\price-finder"
3. Ruleaza serverul:
   & "C:\Users\timbu\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" server.py --host 0.0.0.0 --port 8080

Deschidere pe telefon:
1. Telefonul si calculatorul trebuie sa fie pe acelasi Wi-Fi.
2. Afla IP-ul calculatorului cu:
   ipconfig
3. Cauta linia IPv4 Address, de exemplu 192.168.1.25.
4. Pe telefon deschide in Chrome:
   http://192.168.1.25:8080
5. Cauta produsul.
6. Pentru preturi noi, apasa Actualizeaza si asteapta mesajul de final.

Important:
- Cat timp serverul ruleaza pe calculator, telefonul poate face refresh la preturi.
- Daca inchizi PowerShell sau calculatorul, aplicatia nu mai poate actualiza preturile.
- Netlify Drop este doar static si nu poate rula server.py. Pentru refresh online permanent ai nevoie de hosting cu Python, de exemplu Render, Railway sau un VPS.
- Codul produsului se incarca din pagina produsului cand aplicatia ruleaza cu backend.

Actualizare manuala fara telefon:
& "C:\Users\timbu\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" scrape_linella.py --source-url https://linella.md/ro/catalog --max-pages 300 --out products.json
