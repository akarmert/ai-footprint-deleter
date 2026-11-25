@AGENTS.md

## Claude Code notları

- Ortak kurallar `AGENTS.md` ve `DESIGN.md` içindedir; burada tekrarlanmaz.
- Yerelde çalıştırılacak komutları PowerShell uyumlu ver (geliştirme Windows üzerinde).
- Port 3000 başka bir yerel süreç tarafından tutuluyorsa e2e'yi PowerShell'de `$env:PORT = '3100'; npm run test:e2e` ile çalıştır; Playwright mevcut sunucuyu yeniden kullanır ve yanlış uygulamayı test edebilir.
