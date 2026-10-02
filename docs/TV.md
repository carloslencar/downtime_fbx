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
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --autoplay-policy=no-user-gesture-required --noerrdialogs --disable-session-crashed-bubble http://downtime/
```

(para o Edge: `msedge.exe --kiosk http://downtime/ --edge-kiosk-type=fullscreen --autoplay-policy=no-user-gesture-required`)

**Linux (Chromium):** em `~/.config/autostart/quadro.desktop`:

```
[Desktop Entry]
Type=Application
Name=Quadro de Paradas
Exec=chromium --kiosk --autoplay-policy=no-user-gesture-required --noerrdialogs --disable-session-crashed-bubble http://downtime/
```

## Uma TV por oficina

Com as oficinas cadastradas (Cadastro › Oficinas), cada TV pode mostrar só os equipamentos da sua oficina.
O jeito mais prático é colocar a oficina no endereço do atalho do modo quiosque:

```
http://downtime/?oficina=oficina-norte
```

O endereço exato de cada oficina aparece em **Configurações › Esta tela › Oficina desta tela** depois de escolhê-la.
Sem o endereço, dá para escolher a oficina nesse mesmo menu (fica salvo no aparelho). O nome da oficina aparece no topo
da tela. O alarme sonoro daquela TV também só toca para os equipamentos da oficina.

## Alarme sonoro

Em **Configurações › Esta tela › Alarme sonoro** cada aparelho liga o seu alarme e escolhe os avisos:

- **Nova parada:** três bipes fortes quando a operação abre uma parada (bom para a TV da oficina).
- **Equipamento liberado:** carrilhão curto quando a manutenção libera (bom para a sala de controle).
- **Peças solicitadas:** quando a manutenção pede ou adiciona peças (bom para a tela do planejamento).
- **Peças recebidas:** quando todas as peças de uma parada chegam (bom para a TV da oficina).
- **Lembrete de espera:** repete dois bipes enquanto houver equipamento aguardando atendimento (ou com peças
  recebidas esperando um mecânico) há mais
  do que o tempo escolhido (padrão 15 min).
- **Volume** e botões **Ouvir** para testar.

Os navegadores só liberam som depois que alguém toca na tela. Se aparecer no canto o aviso
"Toque para ativar o alarme sonoro", toque nele uma vez. Para a TV não depender disso, use o modo
quiosque com a opção `--autoplay-policy=no-user-gesture-required` (já incluída nos atalhos abaixo e acima).
Lembre de deixar o som da TV ligado e com volume.

## Preventivas no painel

Quando a próxima preventiva agendada de um equipamento está perto (dentro do aviso, padrão 50 h) ou vencida, o cartão
ganha o selo `PM` e mostra o nome da preventiva e as horas que faltam em verde-água (vencida: selo cheio e borda). A legenda do painel inclui
"Preventiva próxima".

## Comportamento

- O painel se encaixa sozinho na tela: toda a frota aparece sem rolar, em qualquer resolução ou
  escala do Windows (100%, 150%, 300%...). Os cartões crescem quando sobra espaço e diminuem quando falta.

- A TV se reconecta sozinha se a rede ou o servidor cair, e mostra "Reconectando…" enquanto isso,
  mantendo o último estado na tela.
- Depois de uma atualização do sistema, a TV recarrega sozinha.
- O idioma (Português/English) é escolhido por aparelho em **Configurações**.
- Para deixar o QR code de acesso fixo no canto do painel, o administrador liga **QR code fixo no painel**
  em Configurações.
