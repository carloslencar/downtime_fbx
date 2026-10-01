let LANG='pt';try{LANG=localStorage.getItem('qp-lang')==='en'?'en':'pt'}catch(e){}
const EN={
'Quadro de Paradas':'Downtime Board','Operação × Manutenção · frota de mina':'Operations × Maintenance · mine fleet',
'Seção':'Section','Painel':'Board','Cadastro':'Equipment','Configurações':'Settings',
'Modo local':'Local mode','Conectando…':'Connecting…','Sincronizado':'Synced','Reconectando…':'Reconnecting…','Sem sincronização':'Not synced','Base vazia':'Empty database','exemplo local':'local sample',
'Simular acesso como':'Simulate access as','Operação':'Operations','Manutenção':'Maintenance','Supervisor':'Supervisor',
'Gera paradas e liberações automáticas para demonstrar o painel':'Generates automatic stops and releases to demo the board','Simular movimento':'Simulate activity','Simulando…':'Simulating…','Tela cheia':'Full screen',
'Resumo da frota':'Fleet summary','Disponíveis agora':'Available now','Aguardando atendimento':'Waiting for service','Em manutenção':'In maintenance','Aguardando peça':'Waiting for parts','Liberados p/ operação':'Released to operations','Maior espera sem atendimento':'Longest wait without service','Nenhuma':'None',
'Equipamentos por frota':'Equipment by fleet','Fila de atendimento':'Service queue','Últimos eventos':'Latest events',
'Operando':'Operating','Aguardando':'Waiting','Aguard. peça':'Waiting parts','Liberado':'Released','Aguardando manutenção':'Waiting for maintenance','Liberado · aguardando operação':'Released · waiting for operations','aguardando operação':'waiting for operations',
'Toda a frota está operando.':'The whole fleet is operating.','Sem eventos ainda.':'No events yet.','Nenhum equipamento ativo. Cadastre a frota na aba Cadastro.':'No active equipment. Register the fleet in the Equipment tab.',
'Sem frota':'No fleet','Caminhões articulados':'Articulated trucks','Bombas':'Pumps','Escavadeiras grandes':'Large excavators','Escavadeiras pequenas':'Small excavators','Pás carregadeiras':'Wheel loaders','Tratores de esteira':'Dozers','Motoniveladoras':'Motor graders','Perfuratriz':'Drill rig','Comboios':'Fuel trucks',
'Caminhão articulado':'Articulated truck','Escavadeira':'Excavator','Pá carregadeira':'Wheel loader','Trator de esteira':'Dozer','Motoniveladora':'Motor grader','Bomba':'Pump','Caminhão comboio':'Fuel truck',
'ADTs':'ADTs','Escavadeiras':'Excavators','Carregadeiras':'Loaders','Dozers':'Dozers','Perfuratrizes':'Drill rigs',
'Mecânica':'Mechanical','Hidráulica':'Hydraulic','Elétrica':'Electrical','Pneu / rodante':'Tires / undercarriage','Preventiva':'Preventive','Avaria / acidente':'Damage / accident','Outro':'Other',
'Parada aberta':'Stop opened','Atendimento iniciado':'Work started','Liberado pela manutenção':'Released by maintenance','Recebido pela operação':'Received by operations','Atendimento retomado':'Work resumed','Lançamento desfeito':'Entry undone','Lançamento corrigido':'Entry corrected','Parada corrigida':'Stop corrected','Parada cancelada':'Stop cancelled','Equipamento cadastrado':'Unit registered','Cadastro atualizado':'Record updated','Equipamento removido':'Unit removed','Tente de novo':'Try again',
'Abertura da parada':'Stop opening','Início do atendimento':'Start of work','Retomada do atendimento':'Work resumed','Liberação':'Release','Recebimento pela operação':'Receipt by operations',
'Fechar':'Close','Nesta etapa':'In this stage','Parado há':'Down for','Técnico:':'Technician:','Histórico recente':'Recent history',
'Motivo da parada':'Reason for the stop','Escolha um motivo antes de abrir a parada.':'Choose a reason before opening the stop.','Observação':'Note','Colocar em manutenção':'Send to maintenance','Confirmar recebimento':'Confirm receipt',
'Este equipamento está com a manutenção. Só a manutenção pode liberá-lo.':'This unit is with maintenance. Only maintenance can release it.','Paradas são abertas pela operação.':'Stops are opened by operations.','Liberado. Aguardando a operação confirmar o recebimento.':'Released. Waiting for operations to confirm receipt.',
'Técnico responsável':'Assigned technician','Assumir atendimento':'Take the job','Nota (nº do pedido ou serviço feito)':'Note (order number or work done)','Nota da liberação':'Release note','Liberar equipamento':'Release unit','Retomar atendimento':'Resume work',
'Pneu dianteiro direito cortado':'Front right tire cut','Pedido 4502 · filtro hidráulico':'Order 4502 · hydraulic filter','Serviço concluído, testado em campo':'Work done, tested in the field',
'Parada aberta. A manutenção já vê este equipamento na fila.':'Stop opened. Maintenance already sees this unit in the queue.','Atendimento assumido. Quando terminar o serviço, libere por aqui.':'Job taken. When the work is done, release it here.','Marcado como aguardando peça.':'Marked as waiting for parts.','Equipamento liberado. Falta a operação confirmar o recebimento.':'Unit released. Operations still needs to confirm receipt.','Recebimento confirmado. Equipamento de volta à operação.':'Receipt confirmed. Unit back in operation.','Lançamento desfeito. O equipamento voltou para a etapa anterior.':'Entry undone. The unit is back to the previous stage.','Correção salva e registrada no histórico.':'Correction saved and logged in the history.','Parada cancelada e registrada no histórico.':'Stop cancelled and logged in the history.',
'Último lançamento:':'Last entry:','Desfazer':'Undo','Confirmar desfazer':'Confirm undo',
'Seu acesso não permite alterar o quadro':'Your access does not allow changing the board','Não foi possível salvar a mudança':'Could not save the change',
'Horímetro atual':'Current hour meter','Horímetro atual (opcional)':'Current hour meter (optional)','Sem leitura anterior':'No previous reading','Informe o horímetro atual.':'Enter the current hour meter reading.','Valor inválido.':'Invalid value.',
'Como supervisor, você corrige lançamentos. Abrir, atender e liberar ficam com a operação e a manutenção.':'As a supervisor, you correct entries. Opening, servicing and releasing stay with operations and maintenance.',
'Corrigir dados da parada':'Correct stop details','Cancelar parada':'Cancel stop','Corrigir última parada':'Correct last stop','Cancelar última parada':'Cancel last stop','Última parada':'Last stop','Nenhuma parada nos últimos 30 dias para corrigir.':'No stops in the last 30 days to correct.','Nenhuma parada recente encontrada.':'No recent stop found.',
'Corrigir parada em andamento':'Correct ongoing stop','Motivo':'Reason','Início da parada':'Stop start','Início da etapa atual':'Current stage start','Técnico':'Technician','Horímetro (h)':'Hour meter (h)','Horímetro':'Hour meter','Justificativa (fica registrada)':'Justification (it is logged)','Operador lançou no equipamento errado':'Operator logged it on the wrong unit','Voltar':'Back','Salvar correção':'Save correction','Fim (recebido pela operação)':'End (received by operations)','Cancelar parada em andamento':'Cancel ongoing stop',
'O equipamento volta para Operando e esta parada sai dos indicadores. O registro continua no histórico, marcado como cancelado.':'The unit goes back to Operating and this stop leaves the KPIs. The record stays in the history, marked as cancelled.',
'A última parada sai dos indicadores de disponibilidade e tempo de reparo. O registro continua no histórico, marcado como cancelado.':'The last stop leaves the availability and repair time KPIs. The record stays in the history, marked as cancelled.',
'Escolha o motivo.':'Choose the reason.','Escreva uma justificativa curta para a correção.':'Write a short justification for the correction.','Parada não encontrada.':'Stop not found.','Preencha início e fim.':'Fill in start and end.','O início precisa ser antes do fim.':'The start must be before the end.','O fim não pode estar no futuro.':'The end cannot be in the future.','Preencha os horários.':'Fill in the times.','O início da parada precisa ser antes do início da etapa atual.':'The stop start must be before the current stage start.','Horário no futuro. Confira a data.':'Time in the future. Check the date.','Horímetro inválido.':'Invalid hour meter.','Nenhum campo foi alterado.':'No field was changed.','Escreva o motivo do cancelamento.':'Write the reason for the cancellation.',
'Início':'Start','Fim':'End','Início da etapa':'Stage start','Etapa':'Stage','Parada':'Stop','desfeito':'undone','válida':'valid','cancelada':'cancelled','aberta':'open',
'Opções que valem para todas as telas. As mudanças são salvas na hora e chegam às duas TVs e aos celulares.':'Options that apply to every screen. Changes are saved right away and reach both TVs and the phones.',
'Todas as telas':'All screens','Esta tela':'This screen','Idioma':'Language','Vale só para este aparelho. Cada TV, computador e celular pode usar o seu idioma, e os dados continuam os mesmos.':'Applies only to this device. Each TV, computer and phone can use its own language, and the data stays the same.',
'Horímetro nas paradas':'Hour meter on stops','Pede a leitura do horímetro quando a operação abre uma parada e quando a manutenção libera o equipamento. Cada leitura atualiza o cadastro.':'Asks for the hour meter reading when operations opens a stop and when maintenance releases the unit. Each reading updates the equipment record.',
'Ligado':'On','Desligado':'Off','Leitura obrigatória':'Reading required','Sem o horímetro, não dá para abrir nem liberar a parada. Desligado, o campo fica opcional.':'Without the hour meter, the stop cannot be opened or released. When off, the field is optional.',
'Conferir saltos grandes':'Check large jumps','Pede uma segunda confirmação quando a nova leitura passa da anterior por mais do que:':'Asks for a second confirmation when the new reading exceeds the previous one by more than:','Limite de salto em horas':'Jump limit in hours',
'Como funciona':'How it works','Operação abre a parada':'Operations opens the stop','Informa o motivo e':'Enters the reason and','o horímetro no momento da parada':'the hour meter at the time of the stop','Manutenção atende':'Maintenance services it','Nada muda nesta etapa.':'Nothing changes at this stage.','Manutenção libera':'Maintenance releases it','Informa':'Enters','o horímetro após o serviço':'the hour meter after the work',', útil quando o reparo inclui teste com motor ligado.':', useful when the repair includes a test with the engine running.',
'Leituras menores que a anterior são recusadas.':'Readings lower than the previous one are rejected.','Leituras recentes':'Recent readings','Nenhuma leitura registrada ainda. Ligue a opção e abra ou libere uma parada.':'No readings logged yet. Turn the option on and open or release a stop.',
'Salvando…':'Saving…','Salvo · vale para todas as telas':'Saved · applies to every screen','Salvo neste navegador (modo local)':'Saved in this browser (local mode)','Seu acesso não permite mudar as configurações.':'Your access does not allow changing settings.','Não foi possível salvar. Tente de novo.':'Could not save. Try again.','Salvo neste aparelho':'Saved on this device',
'Biblioteca de ícones · filtrar por tipo':'Icon library · filter by type','Buscar TAG, modelo, área ou série':'Search tag, model, area or serial','Buscar equipamento':'Search equipment','+ Novo equipamento':'+ New unit','Formulário de cadastro':'Equipment form',
'TAG':'Tag','Modelo':'Model','Área':'Area','Situação':'Status','Fora do painel':'Off the board','Nenhum equipamento encontrado.':'No equipment found.',
'Novo equipamento':'New unit','Escolha o tipo, a frota e confirme a TAG. O ícone vem da biblioteca.':'Choose the type and fleet, then confirm the tag. The icon comes from the library.','Tipo de equipamento':'Equipment type','O tipo e a TAG ficam fixos depois do cadastro.':'Type and tag are fixed after registration.',
'Frota':'Fleet','+ Nova frota…':'+ New fleet…','Sugerir':'Suggest','Usar o próximo número livre da frota':'Use the next free number in the fleet','Nome da nova frota':'New fleet name','Caminhões pipa':'Water trucks','Prefixo da TAG':'Tag prefix',
'Porte':'Size','Grande':'Large','Pequena':'Small','Aparece como selo G ou P no card da TV.':'Shows as an L or S badge on the TV card.','G':'L','P':'S',
'Fabricante e modelo':'Make and model','Área / frente de lavra':'Area / mining front','Horímetro atual (h)':'Current hour meter (h)','Ano de fabricação':'Year built','Nº de série / chassi':'Serial / chassis no.','Painel da TV':'TV board','Aparece no painel':'Shown on the board','Fora do painel (vendido, parado longo prazo)':'Off the board (sold, long-term idle)',
'Assim o equipamento aparece na TV, dentro do grupo':'This is how the unit shows on the TV, in the group','. Quando a operação abrir uma parada, o ícone muda de cor.':'. When operations opens a stop, the icon changes color.','nova frota':'new fleet',
'Cadastrar equipamento':'Register unit','Salvar alterações':'Save changes','Limpar':'Clear','Remover':'Remove',
'Informe a TAG.':'Enter the tag.','Use o formato PREFIXO-NÚMERO, como ADT-11.':'Use the PREFIX-NUMBER format, like ADT-11.','Dê um nome para a frota.':'Name the fleet.','Já existe uma frota com esse nome.':'A fleet with that name already exists.','Use de 1 a 4 letras.':'Use 1 to 4 letters.','Informe fabricante e modelo.':'Enter make and model.','Horímetro inválido.':'Invalid hour meter.','Ano fora do intervalo.':'Year out of range.',
'Seu acesso não permite alterar o cadastro.':'Your access does not allow changing equipment records.','Não foi possível remover. Tente de novo.':'Could not remove. Try again.','fora do painel':'off the board',
'Este equipamento está parado. Feche a parada antes de remover, ou desligue "Painel da TV".':'This unit is down. Close the stop before removing it, or switch off "TV board".',"Usuários":"Users","Entrar":"Sign in","Sair":"Sign out","Sessão encerrada":"Signed out","Sessão encerrada por inatividade":"Signed out after inactivity","Administrador":"Administrator","Administrador do sistema":"System administrator","Abre paradas e confirma o recebimento dos equipamentos liberados.":"Opens stops and confirms receipt of released units.","Assume atendimentos, marca aguardando peça e libera equipamentos.":"Takes jobs, marks waiting for parts and releases units.","Corrige e cancela lançamentos, cadastra equipamentos e muda as configurações.":"Corrects and cancels entries, registers equipment and changes settings.","Tudo o que o supervisor faz, mais o cadastro de usuários.":"Everything a supervisor does, plus managing users.","Mecânico":"Mechanic","Eletricista":"Electrician","Lubrificador":"Lubricator","Soldador":"Welder","Borracheiro":"Tire technician","Planejador":"Planner","Turno A":"Shift A","Turno B":"Shift B","Administrativo":"Office hours","Quem está entrando?":"Who is signing in?","Escolha seu nome e digite o PIN de 4 dígitos.":"Pick your name and enter your 4-digit PIN.","Buscar nome ou matrícula":"Search name or employee ID","Nenhum usuário cadastrado. Abra a aba Usuários para criar o primeiro administrador.":"No users yet. Open the Users tab to create the first administrator.","Ninguém encontrado com essa busca.":"Nobody matches that search.","Digite seu PIN":"Enter your PIN","Trocar":"Change","Apagar":"Delete","PIN":"PIN","PIN incorreto. Tente de novo.":"Wrong PIN. Try again.","Muitas tentativas. Aguarde 30 segundos.":"Too many attempts. Wait 30 seconds.","Entre com seu usuário para registrar ações neste equipamento.":"Sign in with your user to log actions on this unit.","Acesso restrito":"Restricted access","Cadastro de equipamentos":"Equipment registry","Só administradores gerenciam usuários.":"Only administrators manage users.","Só supervisores e administradores cadastram equipamentos.":"Only supervisors and administrators register equipment.","Trocar de usuário":"Switch user","Só supervisores e administradores mudam estas opções.":"Only supervisors and administrators change these options.","Usuários por perfil · filtrar":"Users by role · filter","Buscar nome, matrícula ou especialidade":"Search name, employee ID or specialty","Buscar usuário":"Search user","+ Novo usuário":"+ New user","Formulário de usuário":"User form","Nome":"Name","Matrícula":"Employee ID","Perfil":"Role","Turno":"Shift","Ativo":"Active","Inativo":"Inactive","Você":"You","Nenhum usuário encontrado.":"No users found.","Novo usuário":"New user","Cada pessoa entra com a matrícula e um PIN de 4 dígitos. O nome curto aparece nos eventos da TV.":"Each person signs in with their name and a 4-digit PIN. The short name shows in the TV events.","este é o seu usuário":"this is your user","Nome completo":"Full name","Nome curto":"Short name","A matrícula fica fixa depois do cadastro.":"The employee ID is fixed after registration.","Perfil de acesso":"Access role","Especialidade":"Specialty","Não informada":"Not set","Técnicos de manutenção aparecem na lista de quem assume o atendimento.":"Maintenance technicians appear in the list of who takes the job.","PIN (4 dígitos)":"PIN (4 digits)","Novo PIN (em branco mantém o atual)":"New PIN (leave blank to keep it)","Confirmar PIN":"Confirm PIN","Acesso":"Access","Pode entrar no sistema":"Can sign in","Bloqueado (não aparece na tela de entrada)":"Blocked (hidden from the sign-in screen)","Cadastrar usuário":"Create user","Informe o nome completo.":"Enter the full name.","Informe o nome curto.":"Enter the short name.","Use de 2 a 12 letras ou números.":"Use 2 to 12 letters or digits.","Essa matrícula já está cadastrada.":"That employee ID is already registered.","O PIN precisa ter 4 números.":"The PIN must have 4 digits.","Os PINs não conferem.":"The PINs do not match.","Este é o único administrador ativo. Cadastre outro antes de mudar.":"This is the only active administrator. Create another one before changing it.","Você não pode bloquear o seu próprio acesso.":"You cannot block your own access.","Seu acesso não permite alterar usuários.":"Your access does not allow changing users.","Usuário atualizado":"User updated","Usuário cadastrado":"User created","Usuário removido":"User removed","Você não pode remover o seu próprio usuário.":"You cannot remove your own user.","Nome da nova área":"New area name","Buscar TAG, modelo ou área":"Search tag, model or area","Área":"Area","Sem área":"No area","Gerenciar áreas":"Manage areas","As áreas são cadastradas pelo administrador.":"Areas are managed by the administrator.","Áreas":"Areas","Locais onde os equipamentos trabalham. Renomear uma área atualiza todos os equipamentos dela.":"Places where the equipment works. Renaming an area updates all its equipment.","Nome da área":"Area name","Salvar":"Save","Mova os equipamentos para outra área antes de remover":"Move the equipment to another area before removing it","Nenhuma área cadastrada.":"No areas yet.","Nova área":"New area","Adicionar área":"Add area","Informe o nome da área.":"Enter the area name.","Já existe uma área com esse nome.":"An area with that name already exists.","Área adicionada.":"Area added.","Área renomeada.":"Area renamed.","Área removida.":"Area removed.","Mova os equipamentos para outra área antes de remover.":"Move the equipment to another area before removing it.","Seu acesso não permite alterar as áreas.":"Your access does not allow changing areas.","equipamento":"unit","equipamentos":"units","Só o administrador muda estas opções.":"Only the administrator can change these options.","Simular movimento: gera paradas e liberações automáticas para demonstrar o painel":"Simulate activity: generates automatic stops and releases to demo the board","Prévia do retrato do painel":"Board snapshot preview","Retrato do painel":"Board snapshot","Uma imagem JPEG do painel como está agora, na proporção 16:9 dos slides do PowerPoint. Dá para colar direto numa apresentação ou enviar por e-mail.":"A JPEG image of the board as it is right now, in the 16:9 ratio of PowerPoint slides. Paste it straight into a presentation or send it by email.","Baixar JPEG · Full HD (1920×1080)":"Download JPEG · Full HD (1920×1080)","Baixar JPEG · 4K (3840×2160)":"Download JPEG · 4K (3840×2160)","Atualizar prévia":"Refresh preview","O Full HD fica legível em tela cheia no projetor. Use o 4K se for dar zoom no slide ou imprimir.":"Full HD is readable full screen on a projector. Use 4K if you will zoom into the slide or print it.","Imagem pronta.":"Image ready.","Dados":"Data","Administrador":"Administrator","Corrige lançamentos, cadastra equipamentos e usuários, e acessa os dados para exportar ao Excel e gerar relatórios.":"Corrects entries, manages equipment and users, and accesses the data to export to Excel and build reports.","Como administrador, você corrige lançamentos. Abrir, atender e liberar ficam com a operação e a manutenção.":"As an administrator, you correct entries. Opening, servicing and releasing stay with operations and maintenance.","Este é o único administrador ativo. Cadastre outro antes de mudar.":"This is the only active administrator. Create another one before changing it.","Este é o único administrador ativo.":"This is the only active administrator.","Só um administrador pode criar ou alterar administradores.":"Only an administrator can create or change administrators.","Só um administrador pode criar administradores":"Only an administrator can create administrators","Só o administrador acessa os dados e as exportações.":"Only the administrator can access data and exports.","Resumo dos dados":"Data summary","Exportar dados":"Export data","Uma planilha com cinco abas: Paradas, Etapas, Correções, Equipamentos e Usuários (sem o PIN). As datas já saem no formato do Excel.":"One workbook with five sheets: Stops, Stages, Corrections, Equipment and Users (no PINs). Dates come out in Excel format.","De":"From","Até":"To","Atualizar":"Refresh","Baixar planilha Excel (.xlsx)":"Download Excel workbook (.xlsx)","Baixar aba atual em CSV":"Download current sheet as CSV","Aba":"Sheet","Conectar no Excel (Power Query)":"Connect in Excel (Power Query)","Baixe a planilha e salve sempre com o mesmo nome, na pasta abaixo, substituindo a anterior.":"Download the workbook and always save it with the same name in the folder below, replacing the previous one.","No Excel, vá em Dados, Obter Dados, De Outras Fontes, Consulta Nula. Abra o Editor Avançado e cole o código.":"In Excel, go to Data, Get Data, From Other Sources, Blank Query. Open the Advanced Editor and paste the code.","Repita para cada aba que quiser. Escolha a aba ao lado para gerar o código dela.":"Repeat for each sheet you want. Pick the sheet on the left to generate its code.","Para atualizar os relatórios, baixe a planilha de novo e clique em Dados, Atualizar Tudo.":"To update the reports, download the workbook again and click Data, Refresh All.","Pasta onde você salva a planilha":"Folder where you save the workbook","Consulta da aba":"Query for sheet","Copiar código":"Copy code","Hoje os dados ficam guardados dentro desta página, e o Excel não consegue buscá-los sozinho. Quando o sistema for para o servidor da intranet, o banco de dados fica acessível ao Power Query por uma conexão somente leitura, e o Atualizar Tudo passa a buscar os dados na hora, sem baixar arquivo.":"Today the data is stored inside this page, and Excel cannot fetch it on its own. Once the system moves to the intranet server, the database becomes available to Power Query through a read-only connection, and Refresh All fetches the data live, with no file download.","Paradas no período":"Stops in the period","Em andamento":"Ongoing","Tempo médio de parada":"Average stop time","Etapas":"Stages","Equipamentos":"Equipment","Paradas":"Stops","Carregando dados…":"Loading data…","Nenhum registro no período.":"No records in the period.","Arquivo pronto. Salve na pasta configurada para o Power Query.":"File ready. Save it in the folder set up for Power Query.","Dados atualizados.":"Data refreshed.","Código copiado. Cole no Editor Avançado do Power Query.":"Code copied. Paste it into the Power Query Advanced Editor.","Código selecionado. Use Ctrl+C para copiar.":"Code selected. Press Ctrl+C to copy.","ID":"ID","Frota":"Fleet","Tipo":"Type","Duração (h)":"Duration (h)","Situação":"Status","Horímetro início":"Hour meter start","Horímetro fim":"Hour meter end","Correções":"Corrections","Encerrada":"Closed","Cancelada":"Cancelled","Registrado por":"Logged by","Parada cancelada":"Stop cancelled","Data":"Date","Por":"By","Campo":"Field","Para":"To","Justificativa":"Justification","Modelo":"Model","Nº de série":"Serial no.","Situação atual":"Current status","No painel":"On the board","Sim":"Yes","Não":"No","QR code":"QR code","QR code de acesso pelo celular":"Phone access QR code","Acesse pelo celular":"Access from your phone","Aponte a câmera para abrir o quadro e registrar paradas.":"Point your camera to open the board and log stops.","QR code fixo no painel":"QR code pinned on the board","Mostra o QR code de acesso no canto do painel, para quem passar pela TV abrir o sistema no celular.":"Shows the access QR code in a corner of the board, so anyone passing by the TV can open the system on their phone.","Link de acesso":"Access link","Endereço que o QR code abre. Troque quando o sistema passar para o servidor da intranet. Em branco, usa o endereço atual.":"Address the QR code opens. Change it when the system moves to the intranet server. Leave blank to use the current address.","Acesso pelo celular":"Phone access","Aponte a câmera do celular para o código.":"Point your phone camera at the code.","QR code do link de acesso":"QR code for the access link","Copiar link":"Copy link","Copiar QR code":"Copy QR code","Baixar PDF":"Download PDF","Baixar imagem":"Download image","Enviar no WhatsApp":"Send on WhatsApp","Copiar mensagem":"Copy message","O PDF sai pronto para imprimir e fixar perto das TVs e na oficina. Para deixar o código sempre visível no painel, ligue \"QR code fixo no painel\" em Configurações.":"The PDF is ready to print and post next to the TVs and in the shop. To keep the code always visible on the board, turn on \"QR code pinned on the board\" in Settings.","Não foi possível gerar o QR code. Verifique a conexão e recarregue a página.":"Could not generate the QR code. Check the connection and reload the page.","Não foi possível gerar o QR code.":"Could not generate the QR code.","Link copiado.":"Link copied.","Mensagem copiada. Cole no WhatsApp, Teams ou e-mail.":"Message copied. Paste it into WhatsApp, Teams or email.","Selecionei o link. Use Ctrl+C para copiar.":"Link selected. Press Ctrl+C to copy.","QR code copiado como imagem.":"QR code copied as an image.","Este navegador não deixou copiar a imagem. Use Baixar imagem.":"This browser did not allow copying the image. Use Download image.","Download indisponível nesta tela.":"Downloads are not available on this screen.","Arquivo pronto.":"File ready.","Já existe um download aguardando confirmação.":"A download is already waiting for confirmation.","Não foi possível baixar o arquivo.":"Could not download the file.","Use um endereço completo, começando com http:// ou https://":"Use a full address, starting with http:// or https://","Correções":"Corrections","Abre paradas e confirma o recebimento. Também corrige lançamentos, cadastra equipamentos e usuários.":"Opens stops and confirms receipt. Also corrects entries and manages equipment and users.","Assume atendimentos, marca aguardando peça e libera. Também corrige lançamentos, cadastra equipamentos e usuários.":"Takes jobs, marks waiting for parts and releases. Also corrects entries and manages equipment and users.","Entre com seu usuário para gerenciar usuários.":"Sign in to manage users.","Entre com seu usuário para cadastrar equipamentos.":"Sign in to register equipment.","Entre com seu usuário para mudar estas opções.":"Sign in to change these options.","Nenhum usuário cadastrado. Abra a aba Usuários para criar o primeiro.":"No users yet. Open the Users tab to create the first one.","Este é o único administrador ativo.":"This is the only active administrator."
};
const PAT=[
 [/^Parada nº (\d+)$/,'Stop #$1'],
 [/^(\d+) peças?$/,(m,n)=>n+(n==='1'?' part':' parts')],
 [/^(\d+) (chegou|chegaram)$/,'$1 arrived'],
 [/^(\d+) itens?$/,(m,n)=>n+(n==='1'?' item':' items')],
 [/^(\d+) (itens chegaram|item chegou)$/,(m,n)=>n+(n==='1'?' item arrived':' items arrived')],
 [/^OC (.+) aplicada a (\d+) itens?\.$/,'PO $1 applied to $2 item(s).'],
 [/^OC (.+) salva\.$/,'PO $1 saved.'],
 [/^OC (.+)$/,'PO $1'],
 [/^Chegou (.+)$/,'Arrived $1'],
 [/^Primeira solicitação (.+)$/,'First request $1'],
 [/^(\d+) peças enviadas ao planejamento\.$/,'$1 parts sent to planning.'],
 [/^(\d+) selecionadas?$/,'$1 selected'],
 [/^(\d+) (itens marcados|item marcado) como chegou\.$/,'$1 marked as arrived.'],
 [/^(\d+) equipamentos?$/,(m,n)=>n+(n==='1'?' unit':' units')],
 [/^Área renomeada\. (\d+) equipamentos? atualizados?\.$/,(m,n)=>'Area renamed. '+n+(n==='1'?' unit':' units')+' updated.'],
 [/^Mostrando (\d+) de (\d+) linhas$/,'Showing $1 of $2 rows'],
 [/^(\d+) linhas$/,'$1 rows'],
 [/^Acesso como (.+)$/,'Signing in as $1'],
 [/^(\d+) de (\d+) usuários$/,'$1 of $2 users'],
 [/^Matrícula (.+)$/,'Employee ID $1'],

 [/^\/(\d+) operando$/,'/$1 operating'],
 [/^(\d+) parados$/,'$1 down'],
 [/^(\d+) cadastrados?$/,'$1 registered'],
 [/^(\d+) de (\d+) equipamentos$/,'$1 of $2 units'],
 [/^(\d+) correç(ão|ões)$/,(m,n)=>n+(n==='1'?' correction':' corrections')],
 [/^Última leitura: (.+)$/,'Last reading: $1'],
 [/^Salto de (.+) h desde a última leitura\. Confira e toque de novo para confirmar\.$/,'Jump of $1 h since the last reading. Check it and tap again to confirm.'],
 [/^Menor que a última leitura \((.+)\)\. Confira o painel da máquina\.$/,'Lower than the last reading ($1). Check the machine display.'],
 [/^(.+) às (\d\d:\d\d)$/,'$1 at $2'],
 [/^dá para desfazer até (\d\d:\d\d)$/,'undo available until $1'],
 [/^Desde (.+)$/,'Since $1'],
 [/^Parado por (.+)$/,'Down for $1'],
 [/^volta para (.+)$/,'back to $1'],
 [/^(.+) de (\d\d:\d\d)$/,'$1 from $2'],
 [/^cadastrado na frota (.+)$/,'registered in fleet $1'],
 [/^Confirmar remoção de (.+)$/,'Confirm removal of $1'],
 [/^(.+) já está cadastrado\.$/,'$1 is already registered.'],
 [/^Editar (.+)$/,'Edit $1'],
 [/^Ano (\d{4})$/,'Year $1'],
 [/^Série (.+)$/,'Serial $1'],
 [/^Horímetro (.+ h)$/,'Hour meter $1'],
 [/^(.+) \(([A-Z]{1,4})\)$/,'$1 ($2)'],
 [/^([A-Z]{1,4})-xx$/,'$1-xx']
];
function numEN(s){return s.replace(/\b(\d{1,3}(?:\.\d{3})+)(?= h\b)/g,m=>m.replace(/\./g,','));}
/* textos da versão servidor */
Object.assign(EN,{
'Sem conexão com o servidor. Tente de novo.':'No connection to the server. Try again.',
'Entre com seu usuário de novo':'Sign in again',
'Entre com seu usuário para registrar alterações.':'Sign in to make changes.',
'No Excel, vá em Dados, Obter Dados, De Outras Fontes, Consulta Nula.':'In Excel, go to Data, Get Data, From Other Sources, Blank Query.',
'Abra o Editor Avançado, apague o que estiver lá e cole o código da tabela escolhida abaixo.':'Open the Advanced Editor, clear it and paste the code for the table chosen below.',
'Repita para cada tabela que quiser usar nos relatórios.':'Repeat for each table you want to use in your reports.',
'Para atualizar, clique em Dados, Atualizar Tudo. O Excel busca os dados direto do servidor, sem baixar arquivo.':'To update, click Data, Refresh All. Excel fetches the data straight from the server, with no file download.',
'Tabela':'Table','Eventos (histórico completo)':'Events (full history)','Eventos':'Events','Consulta da tabela':'Query for table',
'Link direto da tabela (CSV)':'Direct table link (CSV)',
'O código e o link levam a chave de acesso aos relatórios: quem tiver a chave consegue ler os dados. Compartilhe só com quem monta os relatórios.':'The code and the link carry the report access key: anyone with the key can read the data. Share it only with the people who build the reports.',
'Gerar nova chave':'Generate new key','Confirmar: gerar nova chave (as consultas atuais param de funcionar)':'Confirm: generate new key (current queries stop working)',
'Nova chave gerada. Atualize o código das consultas no Excel.':'New key generated. Update the query code in Excel.',
'Não foi possível gerar a nova chave.':'Could not generate a new key.',
'Não foi possível carregar. Verifique a conexão e clique em Atualizar.':'Could not load. Check the connection and click Refresh.',
'Informe o PIN de 4 números.':'Enter the 4-digit PIN.','Perfil inválido.':'Invalid role.',
'Só o administrador remove paradas.':'Only the administrator can remove stops.',
'Endereço que o QR code abre. Em branco, usa o endereço deste servidor. Preencha se a TI criar um nome próprio, por exemplo http://downtime':'Address the QR code opens. Leave blank to use this server address. Fill it in if IT creates a dedicated name, for example http://downtime',
'Arquivo pronto.':'File ready.',
'O primeiro usuário precisa ser administrador.':'The first user must be an administrator.',
'Alarme sonoro':'Sound alarm',
'Toca um aviso neste aparelho quando algo acontece no quadro. Ligue na TV da oficina e na sala de controle; cada tela escolhe os seus avisos.':'Plays an alert on this device when something happens on the board. Turn it on at the shop TV and the control room; each screen picks its own alerts.',
'O navegador só libera o som depois que alguém toca na tela. Toque em qualquer lugar uma vez, ou deixe a TV no modo quiosque (ver docs/TV.md).':'The browser only allows sound after someone touches the screen. Tap anywhere once, or run the TV in kiosk mode (see docs/TV.md).',
'Nova parada':'New stop','Três bipes fortes quando a operação abre uma parada.':'Three loud beeps when operations opens a stop.',
'Equipamento liberado':'Unit released','Carrilhão curto quando a manutenção libera um equipamento.':'Short chime when maintenance releases a unit.',
'Lembrete de espera':'Waiting reminder','Repete dois bipes enquanto houver equipamento aguardando atendimento há mais de:':'Repeats two beeps while any unit has been waiting for service for more than:',
'Volume':'Volume','O volume final também depende do volume da TV ou do computador.':'The final loudness also depends on the TV or computer volume.',
'Ouvir':'Play',
'Peças solicitadas':'Parts requested','Peças solic.':'Parts req.','Peças':'Parts','Planejamento':'Planning',
'Recebe as solicitações de peças da manutenção, informa a ordem de compra e marca a chegada das peças.':'Receives parts requests from maintenance, enters the purchase order and marks when parts arrive.',
'Assume atendimentos, solicita peças e libera. Também corrige lançamentos, cadastra equipamentos e usuários.':'Takes jobs, requests parts and releases. Also corrects entries and manages equipment and users.',
'Solicitar peças':'Request parts','Adicionar peças':'Add parts','Enviar solicitação':'Send request','+ Adicionar linha':'+ Add line',
'Descrição da peça':'Part description','Código (opcional)':'Code (optional)','Código':'Code','Qtd':'Qty','Peça':'Part','Quantidade':'Quantity',
'Remover linha':'Remove line','Escreva pelo menos uma peça.':'Write at least one part.','Toda linha com código precisa da descrição da peça.':'Every line with a code needs the part description.',
'Não foi possível enviar. Tente de novo.':'Could not send. Try again.','Peça enviada ao planejamento.':'Part sent to planning.',
'O planejamento recebe a lista, informa a ordem de compra e marca a chegada. Enquanto houver peça pendente, o equipamento fica em':'Planning receives the list, enters the purchase order and marks arrival. While any part is pending, the unit stays in',
'; quando tudo chegar, volta para':'; when everything arrives, it goes back to',
'Aguardando ordem de compra':'Waiting for purchase order','aguardando chegada':'awaiting delivery','Cancelada':'Cancelled','Aguardando':'Waiting',
'Abrir na página Peças':'Open in the Parts page','O planejamento acompanha as solicitações de peças na página Peças.':'Planning follows parts requests in the Parts page.',
'Solicitações abertas':'Open requests','Peças sem ordem de compra':'Parts without purchase order','Peças aguardando chegada':'Parts awaiting delivery','Chegaram nos últimos 7 dias':'Arrived in the last 7 days',
'Pendentes':'Pending','Sem ordem de compra':'No purchase order','Todas':'All','Buscar TAG, nº da parada, peça ou OC':'Search tag, stop #, part or PO',
'Ordem de compra':'Purchase order','Chegada':'Arrival','Solicitada':'Requested','Nº da OC':'PO number','Marcar chegada':'Mark arrived','Confirmar':'Confirm',
'Selecione itens para usar a mesma OC':'Select items to use the same PO','Aplicar aos selecionados':'Apply to selected','Marcar chegada dos selecionados':'Mark selected as arrived',
'Adicionar peça':'Add part','Adicionar':'Add','Informe o número da ordem de compra.':'Enter the purchase order number.','Escreva a descrição da peça.':'Write the part description.',
'Peça adicionada à solicitação.':'Part added to the request.','OC removida.':'PO removed.','Nenhuma solicitação de peças ainda.':'No parts requests yet.','Nenhuma solicitação encontrada.':'No requests found.',
'Equipamento removido':'Unit removed','Parada encerrada':'Stop closed','Outra parada em andamento':'Another stop in progress','Desfazer a chegada':'Undo arrival',
'Entre com seu usuário para ver as solicitações de peças.':'Sign in to see parts requests.','Peças adicionadas':'Parts added','Peças recebidas':'Parts received','Solicitação de peças cancelada':'Parts request cancelled','atendimento retomado':'work resumed',
'Ordem de compra e chegada da peça são marcadas pelo planejamento.':'Purchase order and arrival are set by planning.','Só a manutenção e o planejamento mexem na lista de peças.':'Only maintenance and planning change the parts list.',
'Dois bipes duplos quando a manutenção pede ou adiciona peças. Para a tela do planejamento.':'Two double beeps when maintenance requests or adds parts. For the planning screen.',
'Duas notas quando todas as peças de uma parada chegam. Para a TV da oficina.':'Two notes when all parts for a stop arrive. For the shop TV.',
'Uma planilha com seis abas: Paradas, Etapas, Correções, Peças, Equipamentos e Usuários (sem o PIN).':'One workbook with six sheets: Stops, Stages, Corrections, Parts, Equipment and Users (no PINs).',
'Resumo das peças':'Parts summary','Buscar solicitações de peças':'Search parts requests','Mostrar':'Show','Nº':'No.','Toque para ativar o alarme sonoro':'Tap to enable the sound alarm','Minutos de espera':'Minutes waiting','Volume do alarme':'Alarm volume'
});
function trPart(p){
  if(!p)return p;
  if(Object.prototype.hasOwnProperty.call(EN,p))return EN[p];
  for(const [re,rep] of PAT){
    if(re.test(p))return p.replace(re,(...a)=>typeof rep==='function'?rep(...a):rep.replace(/\$(\d)/g,(_,i)=>{const g=a[+i];const y=trPart(g);return y==null?g:y;}));
  }
  return null;
}
function tr(s){
  if(!s||!/[A-Za-zÀ-ú]/.test(s))return s;
  const m=s.match(/^([\s·]*)([\s\S]*?)([\s·]*)$/);const core=m[2];if(!core)return s;
  let r=trPart(core);
  if(r==null){
    for(const sep of [' · ','; ',' → ',' — ',': ']){
      if(core.includes(sep)){r=core.split(sep).map(x=>{const y=trPart(x.trim());return y==null?tr(x):(x.match(/^\s*/)[0]+y);}).join(sep);break;}
    }
  }
  if(r==null)r=core;
  return m[1]+numEN(r)+m[3];
}
const T_ORIG=new WeakMap(),A_ORIG=new WeakMap(),T_ATTRS=['placeholder','title','aria-label'];
function trText(n){
  const p=n.parentNode;if(!p||/^(SCRIPT|STYLE|TEXTAREA)$/.test(p.nodeName))return;
  let r=T_ORIG.get(n);const cur=n.data;
  if(!r||cur!==r.shown){r={pt:cur};T_ORIG.set(n,r);}
  const want=LANG==='en'?tr(r.pt):r.pt;r.shown=want;if(cur!==want)n.data=want;
}
function trAttr(el,at){
  let m=A_ORIG.get(el);if(!m){m={};A_ORIG.set(el,m);}
  const cur=el.getAttribute(at);if(cur==null)return;let r=m[at];
  if(!r||cur!==r.shown){r={pt:cur};m[at]=r;}
  const want=LANG==='en'?tr(r.pt):r.pt;r.shown=want;if(cur!==want)el.setAttribute(at,want);
}
function trTree(n){
  if(n.nodeType===3)return trText(n);
  if(n.nodeType!==1||/^(SCRIPT|STYLE)$/.test(n.nodeName))return;
  for(const at of T_ATTRS)if(n.hasAttribute(at))trAttr(n,at);
  for(const c of n.childNodes)trTree(c);
}
new MutationObserver(list=>{for(const m of list){
  if(m.type==='characterData')trText(m.target);
  else if(m.type==='attributes')trAttr(m.target,m.attributeName);
  else m.addedNodes.forEach(trTree);
}}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:T_ATTRS});
function aplicarIdioma(){
  document.documentElement.lang=LANG==='en'?'en':'pt-BR';
  document.title=LANG==='en'?'Downtime Board':'Quadro de Paradas';
  trTree(document.body);
  document.querySelectorAll('#c-lang button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lang===LANG)));
  if(typeof tick==='function')tick();
}
function setLang(l){
  LANG=l==='en'?'en':'pt';try{localStorage.setItem('qp-lang',LANG)}catch(e){}
  aplicarIdioma();
  const st=document.getElementById('c-lang-st');if(st){st.textContent='Salvo neste aparelho';st.className='cfg-st ok';setTimeout(()=>{st.textContent='';},3000);}
}
document.querySelectorAll('#c-lang button').forEach(b=>b.addEventListener('click',()=>setLang(b.dataset.lang)));
aplicarIdioma();
