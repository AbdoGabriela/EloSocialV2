# Elo Social Web: instruções de instalação (AC4)

| VM | Sistema | Função | IP de exemplo |
|---|---|---|---|
| VM 1 | Windows Server 2022 | Aplicação (site + backend Python) e MySQL Workbench | 192.168.56.101 |
| VM 2 | Kali Linux | Servidor MySQL (banco `02_EloSocial`) | 192.168.56.102 |

> Os IPs acima são exemplos. Se os seus forem diferentes, troque-os em **três lugares**: neste guia, no `config.ini` e no final do `banco/elosocial-bd.sql`.

## Conteúdo da pasta `elo-social-web`

```
elo-social-web/
├── app.py                  -> backend (Flask), com as consultas SQL do EloSocial_Final.py
├── config.ini              -> IP do banco, usuário, senha e porta do site
├── requirements.txt        -> bibliotecas Python
├── iniciar-elosocial.bat   -> inicia o site sem o VS Code
├── banco/
│   └── elosocial-bd.sql    -> script do banco (6 tabelas + usuário da aplicação)
└── static/
    ├── login.html          -> página inicial (login)
    ├── cadastro.html       -> cadastro de usuário (funcionário)
    ├── app.html            -> sistema (dashboard, equipamentos, acolhidos, medicação)
    ├── css/style.css
    ├── js/ (comum.js, login.js, cadastro.js, app.js)
    └── img/ (logo e fundo)
```

### Permissões por ocupação

| Ocupação | Ler | Inserir | Alterar | Excluir |
|---|---|---|---|---|
| Coordenador | ✔ | ✔ | ✔ | ✔ |
| Assistente Social | ✔ | ✔ | ✔ | ✘ |
| Psicólogo | ✔ | ✔ | ✔ | ✘ |
| Cuidador | ✔ | ✘ | ✘ | ✘ |

O bloqueio acontece no backend (Python). Mesmo que alguém tente burlar a tela, o servidor recusa a ação. Os botões que o perfil não pode usar também ficam escondidos.

---

## PARTE 1: Rede entre as VMs (VirtualBox)

Faça isso nas **duas** VMs, com elas desligadas:

1. **Configurações → Rede → Adaptador 1:** `NAT`. Serve para ter internet e instalar programas.
2. **Adaptador 2:** marque *Habilitar placa de rede* e escolha `Placa de rede exclusiva de hospedeiro (Host-Only)`. É a rede em que as duas VMs vão conversar.
3. Ligue as VMs.

### IP fixo no Windows Server (VM 1)
1. *Painel de Controle → Central de Rede e Compartilhamento → Alterar as configurações do adaptador*.
2. Clique com o botão direito no adaptador **Ethernet 2** → *Propriedades* → *Protocolo IP Versão 4 (TCP/IPv4)*.
3. Preencha: IP `192.168.56.101`, máscara `255.255.255.0`. Deixe o gateway em branco.

### IP fixo no Kali (VM 2)
```bash
nmcli con show                       # descubra o nome da 2ª conexão (ex: "Wired connection 2")
sudo nmcli con mod "Wired connection 2" ipv4.method manual ipv4.addresses 192.168.56.102/24
sudo nmcli con up "Wired connection 2"
ip a                                 # confira o IP 192.168.56.102
```

📸 **Print 03 (Rede):** `ipconfig` no Windows Server e `ip a` no Kali.

---

## PARTE 2: MySQL na VM 2 (Kali)

### 2.1 Instalar o MySQL (repositório oficial da Oracle)
```bash
cd ~
wget https://dev.mysql.com/get/mysql-apt-config_0.8.36-1_all.deb
sudo dpkg -i mysql-apt-config_0.8.36-1_all.deb
```
- Se ele perguntar a distribuição, escolha **debian bookworm**.
- Em *MySQL Server & Cluster*, escolha **mysql-8.4-lts** → *Ok*.

> Se o `wget` der erro 404, a versão do arquivo mudou. Pegue o nome atual em https://dev.mysql.com/downloads/repo/apt/.

```bash
sudo apt update
sudo apt install mysql-server -y
```
Durante a instalação ele pede uma **senha para o root**. Anote essa senha.

```bash
sudo systemctl enable --now mysql    # inicia agora e sempre que o Kali ligar
sudo systemctl status mysql          # deve aparecer "active (running)"
mysql --version                      # mostra a versão do MySQL
```

### 2.2 Liberar o acesso pela rede
```bash
sudo ss -tlnp | grep 3306
```
- Se aparecer `*:3306` ou `0.0.0.0:3306`, já está escutando na rede. Pule para o 2.3.
- Se aparecer `127.0.0.1:3306`, edite o arquivo de configuração:
  ```bash
  sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
  ```
  Abaixo de `[mysqld]`, adicione ou altere a linha `bind-address = 0.0.0.0`. Salve (Ctrl+O, Enter, Ctrl+X) e reinicie:
  ```bash
  sudo systemctl restart mysql
  ```

> O Kali vem sem firewall ativo. Se você tiver instalado o `ufw`, libere a porta só para a VM 1:
> `sudo ufw allow from 192.168.56.101 to any port 3306 proto tcp`

### 2.3 Criar o usuário para o MySQL Workbench
```bash
sudo mysql -u root -p
```
```sql
CREATE USER 'gabriela'@'192.168.56.101' IDENTIFIED BY 'SuaSenhaForte#2026';
GRANT ALL PRIVILEGES ON *.* TO 'gabriela'@'192.168.56.101' WITH GRANT OPTION;
FLUSH PRIVILEGES;
EXIT;
```
Esse usuário só consegue entrar **a partir do IP da VM 1**.

📸 **Print 04 (Banco):** `systemctl status mysql` e `mysql --version`.

---

## PARTE 3: Aplicação na VM 1 (Windows Server)

### 3.1 Instalar o Python
1. Baixe o Python 3.12 (ou mais novo) em https://www.python.org/downloads/windows/.
2. Na instalação, marque **"Add python.exe to PATH"**.
3. Confira no PowerShell: `python --version`.

### 3.2 Testar a conexão com o banco
No PowerShell:
```powershell
Test-NetConnection 192.168.56.102 -Port 3306
```
Deve aparecer `TcpTestSucceeded : True`.

📸 Este print serve de evidência de comunicação entre as VMs (Print 03).

### 3.3 Criar o banco pelo MySQL Workbench
1. Abra o Workbench → **+** (nova conexão):
   - Connection Name: `Kali - EloSocial`
   - Hostname: `192.168.56.102`, Port: `3306`
   - Username: `gabriela` → *Store in Vault* → sua senha
   - *Test Connection* → OK
2. Antes de executar o script, abra o `banco/elosocial-bd.sql` e confira, no final dele, o **IP da VM 1** e a **senha** do usuário `app_elosocial`.
3. Abra a conexão → *File → Open SQL Script* → `elosocial-bd.sql` → ⚡ (Execute).
4. Atualize o painel *Schemas* e veja o banco `02_EloSocial` com as 6 tabelas.

📸 **Print 04:** conexão do Workbench com o IP do Kali, as tabelas e o usuário `app_elosocial` (em *Administration → Users and Privileges*).

### 3.4 Copiar e configurar a aplicação
1. Copie a pasta `elo-social-web` para `C:\elo-social-web`.
2. No PowerShell:
   ```powershell
   cd C:\elo-social-web
   pip install -r requirements.txt
   ```
3. Abra o `config.ini` no Bloco de Notas e confira:
   ```ini
   [mysql]
   host = 192.168.56.102        ; IP da VM 2, nunca localhost
   user = app_elosocial
   password = (a mesma senha que está no script SQL)
   database = 02_EloSocial     ; com maiúsculas/minúsculas iguais às do script
   ```

> ⚠️ **Atenção ao nome do banco:** no Linux, o MySQL diferencia maiúsculas de minúsculas no nome do banco. O `.py` antigo usava `02_elosocial` (minúsculo), o que funcionava no Windows mas **dá erro no Kali**. Use `02_EloSocial`.

### 3.5 Liberar a porta do site no firewall do Windows
PowerShell **como Administrador**:
```powershell
New-NetFirewallRule -DisplayName "Elo Social (TCP 5000)" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow
```

### 3.6 Iniciar o site (sem VS Code)
1. **Feche o VS Code.**
2. Dê dois cliques em `C:\elo-social-web\iniciar-elosocial.bat`.
3. Abre uma janela preta com: `Elo Social rodando em http://0.0.0.0:5000`.
4. **Não feche essa janela.** Pode minimizar. Ela é o servidor do site.

O site roda com o **Waitress**, um servidor próprio para produção. Ele não depende do VS Code nem de nenhum editor.

📸 **Print 05 (Hospedagem):** a pasta `C:\elo-social-web`, o `config.ini` (com a **senha apagada/borrada**) e a janela do servidor rodando.

### 3.7 (Opcional) Iniciar sozinho quando o Windows Server ligar
PowerShell como Administrador:
```powershell
schtasks /create /tn "EloSocial" /tr "C:\elo-social-web\iniciar-elosocial.bat" /sc onlogon /rl highest
```

---

## PARTE 4: Teste final (com o VS Code fechado)

1. No navegador da VM 1, ou do seu notebook (a rede Host-Only permite), acesse:
   **http://192.168.56.101:5000**
2. Clique em **Cadastre-se** e crie um usuário **Coordenador**.
3. Entre com esse e-mail e senha.
4. Vá em **Residência Inclusiva → + Novo Acolhido** e cadastre um acolhido com dados fictícios.

📸 **Print 06 (Cadastro funcionando):** endereço no navegador, formulário preenchido e o resultado na lista.

5. Comprove que o registro está **no MySQL da VM 2**:
   - **No Workbench:**
     ```sql
     USE 02_EloSocial;
     SELECT * FROM tbl_acolhido;
     SELECT id_usuario, nome_usuario, email, ocupacao FROM tbl_usuario;
     ```
   - **Direto no terminal do Kali** (é a prova mais forte de que o dado está na VM 2):
     ```bash
     sudo mysql -u root -p -e "SELECT * FROM 02_EloSocial.tbl_acolhido;"
     ```

📸 **Print 07 (Gravação no MySQL):** a consulta mostrando o mesmo registro cadastrado no site. A coluna `senha_hash` aparece embaralhada porque a senha **nunca é gravada em texto puro**. Vale citar isso na apresentação.

6. Atualize a página (F5) e confira que o registro continua lá.

📸 **Print 08 (VS Code fechado):** barra de tarefas sem o VS Code, a janela do servidor ativa e o site funcionando.

7. *(Extra para a apresentação)* Crie um usuário **Cuidador** e mostre que ele só consegue visualizar, sem botões de inserir, alterar ou excluir.

---

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| "Não foi possível falar com o banco de dados (VM 2)" | IP errado no `config.ini`, MySQL parado ou rede | `Test-NetConnection 192.168.56.102 -Port 3306`; no Kali, `sudo systemctl status mysql` |
| `Access denied for user 'app_elosocial'` | Senha diferente ou IP da VM 1 errado no script | O IP em `'app_elosocial'@'IP'` tem que ser o da VM 1. Recrie o usuário com o IP certo |
| `Unknown database '02_elosocial'` | Maiúsculas/minúsculas | Use `02_EloSocial` no `config.ini` |
| O site não abre pelo notebook | Firewall do Windows | Refaça o passo 3.5 |
| `python` não é reconhecido | Python fora do PATH | Reinstale marcando "Add python.exe to PATH" |
| A janela do `.bat` fecha sozinha | Erro ao iniciar | Leia a mensagem antes do `pause`. Geralmente é o `pip install` que faltou |
