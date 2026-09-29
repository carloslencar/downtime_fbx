# TVs da sala de controle e da oficina

O painel foi desenhado para TV Full HD (1920×1080) ou 4K, em tela cheia.

## Montagem simples

1. Um mini PC, stick com Windows/Linux ou a própria Smart TV com navegador, ligado na rede da empresa (cabo, se possível).
2. Abra `http://downtime/` (ou o IP do servidor) no Chrome ou Edge.
3. Clique em **Tela cheia**. Não precisa entrar com usuário na TV.
4. Desative a suspensão de tela e a proteção de tela do aparelho.

## Abrir sozinho ao ligar (modo quiosque)

**Windows (Chrome ou Edge):** crie um atalho na pasta Inicializar (`Win+R` › `shell:startup`) com o destino:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --noerrdialogs --disable-session-crashed-bubble http://downtime/
```

(para o Edge: `msedge.exe --kiosk http://downtime/ --edge-kiosk-type=fullscreen`)

**Linux (Chromium):** em `~/.config/autostart/quadro.desktop`:

```
[Desktop Entry]
Type=Application
Name=Quadro de Paradas
Exec=chromium --kiosk --noerrdialogs --disable-session-crashed-bubble http://downtime/
```

## Comportamento

- A TV se reconecta sozinha se a rede ou o servidor cair, e mostra "Reconectando…" enquanto isso,
  mantendo o último estado na tela.
- Depois de uma atualização do sistema, a TV recarrega sozinha.
- O idioma (Português/English) é escolhido por aparelho em **Configurações**.
- Para deixar o QR code de acesso fixo no canto do painel, o administrador liga **QR code fixo no painel**
  em Configurações.
