"""
Elo Social - Versão Web (AC4)
Backend em Python (Flask) que roda na VM 1 (Windows Server)
e grava os dados no MySQL da VM 2.

As consultas SQL foram aproveitadas do EloSocial_Final.py (versão de terminal).
O que era input()/print() virou rotas que recebem e devolvem JSON
para as páginas HTML/CSS/JavaScript da pasta static.
"""
import configparser
import os
import re
from datetime import date, datetime, timedelta
from functools import wraps

import mysql.connector
from flask import Flask, jsonify, redirect, request, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash

PASTA = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------
# Configuração (config.ini) - IP do banco, usuário, senha etc.
# ---------------------------------------------------------------------
config = configparser.ConfigParser(interpolation=None)
config.read(os.path.join(PASTA, "config.ini"), encoding="utf-8")

DB = {
    "host": config.get("mysql", "host", fallback="localhost"),
    "port": config.getint("mysql", "port", fallback=3306),
    "user": config.get("mysql", "user", fallback="root"),
    "password": config.get("mysql", "password", fallback=""),
    "database": config.get("mysql", "database", fallback="02_EloSocial"),
    # Usa o conector 100% Python: a versão em C fechava o servidor sem aviso no Windows
    "use_pure": True,
}

app = Flask(__name__, static_folder="static", static_url_path="/static")
app.secret_key = config.get("app", "secret_key", fallback="troque-esta-chave")
app.permanent_session_lifetime = timedelta(hours=8)

OCUPACOES = ["Coordenador", "Assistente Social", "Cuidador", "Psicólogo"]

# Permissões por ocupação
PERMISSOES = {
    "Coordenador": {"ler": True, "criar": True, "editar": True, "excluir": True},
    "Assistente Social": {"ler": True, "criar": True, "editar": True, "excluir": False},
    "Psicólogo": {"ler": True, "criar": True, "editar": True, "excluir": False},
    "Cuidador": {"ler": True, "criar": False, "editar": False, "excluir": False},
}


# ---------------------------------------------------------------------
# Banco de dados
# ---------------------------------------------------------------------
def conectar():
    """Abre uma conexão nova com o MySQL da VM 2."""
    return mysql.connector.connect(**DB)


def consultar(sql, valores=(), um=False):
    """SELECT: devolve lista de dicionários (ou um só, se um=True)."""
    conexao = conectar()
    try:
        cursor = conexao.cursor(dictionary=True)
        cursor.execute(sql, valores)
        resultado = cursor.fetchone() if um else cursor.fetchall()
        cursor.close()
        return resultado
    finally:
        conexao.close()


def executar(sql, valores=()):
    """INSERT / UPDATE / DELETE com commit. Devolve (linhas afetadas, último id)."""
    conexao = conectar()
    try:
        cursor = conexao.cursor()
        cursor.execute(sql, valores)
        conexao.commit()
        resultado = (cursor.rowcount, cursor.lastrowid)
        cursor.close()
        return resultado
    finally:
        conexao.close()


def serializar(obj):
    """Converte datas e horas do MySQL para texto (JSON)."""
    if isinstance(obj, list):
        return [serializar(o) for o in obj]
    if isinstance(obj, dict):
        return {k: serializar(v) for k, v in obj.items()}
    if isinstance(obj, (date, datetime)):
        return obj.strftime("%d/%m/%Y")
    if isinstance(obj, timedelta):  # campo TIME
        total = int(obj.total_seconds())
        return f"{total // 3600:02d}:{(total % 3600) // 60:02d}"
    return obj


def erro(mensagem, status=400):
    return jsonify({"erro": mensagem}), status


def data_br_para_bd(texto, obrigatoria=True):
    """dd/mm/aaaa ou aaaa-mm-dd -> aaaa-mm-dd (mesma ideia do strptime do .py)."""
    texto = (texto or "").strip()
    if not texto:
        if obrigatoria:
            raise ValueError("Data obrigatória.")
        return None
    for formato in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(texto, formato).strftime("%Y-%m-%d")
        except ValueError:
            pass
    raise ValueError("Data inválida! Use o formato dd/mm/aaaa.")


# ---------------------------------------------------------------------
# Login e permissões
# ---------------------------------------------------------------------
def login_obrigatorio(f):
    @wraps(f)
    def verificar(*args, **kwargs):
        if "id_usuario" not in session:
            return erro("Faça login para continuar.", 401)
        return f(*args, **kwargs)
    return verificar


def permissao(acao):
    """Bloqueia a rota se a ocupação do usuário não puder fazer a ação."""
    def decorador(f):
        @wraps(f)
        @login_obrigatorio
        def verificar(*args, **kwargs):
            ocupacao = session.get("ocupacao")
            if not PERMISSOES.get(ocupacao, {}).get(acao):
                return erro(f"Seu perfil ({ocupacao}) não tem permissão para esta ação.", 403)
            return f(*args, **kwargs)
        return verificar
    return decorador


# ---------------------------------------------------------------------
# Páginas
# ---------------------------------------------------------------------
@app.route("/")
def pagina_inicial():
    if "id_usuario" in session:
        return redirect("/app")
    return send_from_directory(app.static_folder, "login.html")


@app.route("/cadastro")
def pagina_cadastro():
    return send_from_directory(app.static_folder, "cadastro.html")


@app.route("/app")
def pagina_app():
    if "id_usuario" not in session:
        return redirect("/")
    return send_from_directory(app.static_folder, "app.html")


# ---------------------------------------------------------------------
# API - Usuários (cadastro, login, logout)
# ---------------------------------------------------------------------
@app.get("/api/equipamentos")
def listar_equipamentos():
    """Residências de acolhimento (RI, SAICA, CPA)."""
    dados = consultar(
        "SELECT id_esta, nome_esta FROM tbl_estabelecimento "
        "WHERE tipo_esta = 'Residência de Acolhimento' ORDER BY id_esta")
    return jsonify(dados)


@app.post("/api/usuarios")
def cadastrar_usuario():
    d = request.get_json(silent=True) or {}
    nome = (d.get("nome") or "").strip()
    email = (d.get("email") or "").strip().lower()
    senha = d.get("senha") or ""
    ocupacao = d.get("ocupacao")
    try:
        fk_esta = int(d.get("equipamento"))
    except (TypeError, ValueError):
        return erro("Selecione o equipamento em que trabalha.")
    try:
        data_nasc = data_br_para_bd(d.get("data_nasc"))
    except ValueError as e:
        return erro(str(e))

    if not nome:
        return erro("Informe o nome.")
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        return erro("E-mail inválido.")
    if len(senha) < 6:
        return erro("A senha precisa ter pelo menos 6 caracteres.")
    if ocupacao not in OCUPACOES:
        return erro("Selecione uma ocupação válida.")

    sql = ("INSERT INTO tbl_usuario (nome_usuario, data_nasc, email, senha_hash, fk_esta, ocupacao) "
           "VALUES (%s,%s,%s,%s,%s,%s)")
    try:
        executar(sql, (nome, data_nasc, email, generate_password_hash(senha), fk_esta, ocupacao))
    except mysql.connector.IntegrityError:
        return erro("Este e-mail já está cadastrado.")
    except mysql.connector.Error:
        return erro("Erro ao cadastrar! Verifique os dados e tente novamente.", 500)
    return jsonify({"mensagem": "Usuário cadastrado com sucesso!"}), 201


@app.post("/api/login")
def login():
    d = request.get_json(silent=True) or {}
    email = (d.get("email") or "").strip().lower()
    senha = d.get("senha") or ""
    usuario = consultar(
        "SELECT u.id_usuario, u.nome_usuario, u.senha_hash, u.ocupacao, u.fk_esta, e.nome_esta "
        "FROM tbl_usuario u INNER JOIN tbl_estabelecimento e ON u.fk_esta = e.id_esta "
        "WHERE u.email = %s", (email,), um=True)
    if not usuario or not check_password_hash(usuario["senha_hash"], senha):
        return erro("E-mail ou senha incorretos.", 401)
    session.clear()
    session.permanent = True
    session["id_usuario"] = usuario["id_usuario"]
    session["nome"] = usuario["nome_usuario"]
    session["ocupacao"] = usuario["ocupacao"]
    session["fk_esta"] = usuario["fk_esta"]
    session["nome_esta"] = usuario["nome_esta"]
    return jsonify({"mensagem": "Login realizado."})


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify({"mensagem": "Até logo!"})


@app.get("/api/me")
@login_obrigatorio
def usuario_logado():
    return jsonify({
        "nome": session["nome"],
        "ocupacao": session["ocupacao"],
        "equipamento": session["nome_esta"],
        "id_equipamento": session["fk_esta"],
        "permissoes": PERMISSOES[session["ocupacao"]],
    })


# ---------------------------------------------------------------------
# API - Senhas (alterar a própria / Coordenador redefine a de outro)
# ---------------------------------------------------------------------
def somente_coordenador(f):
    """Bloqueia a rota para quem não é Coordenador."""
    @wraps(f)
    @login_obrigatorio
    def verificar(*args, **kwargs):
        if session.get("ocupacao") != "Coordenador":
            return erro("Apenas o Coordenador pode acessar esta função.", 403)
        return f(*args, **kwargs)
    return verificar


@app.put("/api/me/senha")
@login_obrigatorio
def alterar_minha_senha():
    """Usuário logado troca a própria senha (precisa informar a atual)."""
    d = request.get_json(silent=True) or {}
    senha_atual = d.get("senha_atual") or ""
    nova_senha = d.get("nova_senha") or ""
    if len(nova_senha) < 6:
        return erro("A nova senha precisa ter pelo menos 6 caracteres.")
    usuario = consultar("SELECT senha_hash FROM tbl_usuario WHERE id_usuario = %s",
                        (session["id_usuario"],), um=True)
    if not usuario or not check_password_hash(usuario["senha_hash"], senha_atual):
        return erro("A senha atual está incorreta.")
    executar("UPDATE tbl_usuario SET senha_hash = %s WHERE id_usuario = %s",
             (generate_password_hash(nova_senha), session["id_usuario"]))
    return jsonify({"mensagem": "Senha alterada com sucesso!"})


@app.get("/api/usuarios")
@somente_coordenador
def listar_usuarios():
    """Lista de funcionários cadastrados (tela de administração do Coordenador)."""
    dados = consultar(
        "SELECT u.id_usuario, u.nome_usuario, u.email, u.ocupacao, e.nome_esta "
        "FROM tbl_usuario u INNER JOIN tbl_estabelecimento e ON u.fk_esta = e.id_esta "
        "ORDER BY u.nome_usuario")
    return jsonify(dados)


@app.put("/api/usuarios/<int:id_usuario>/senha")
@somente_coordenador
def redefinir_senha(id_usuario):
    """Coordenador define uma senha provisória para um funcionário."""
    d = request.get_json(silent=True) or {}
    nova_senha = d.get("nova_senha") or ""
    if len(nova_senha) < 6:
        return erro("A nova senha precisa ter pelo menos 6 caracteres.")
    linhas, _ = executar("UPDATE tbl_usuario SET senha_hash = %s WHERE id_usuario = %s",
                         (generate_password_hash(nova_senha), id_usuario))
    if linhas == 0:
        return erro("Usuário não encontrado.", 404)
    return jsonify({"mensagem": "Senha redefinida! Passe a senha provisória ao funcionário."})


# ---------------------------------------------------------------------
# API - Estabelecimentos (locais de consulta: UBS, Clínica, AME...)
# Equivale a listar_estabelecimento() do .py
# ---------------------------------------------------------------------
@app.get("/api/locais")
@login_obrigatorio
def listar_locais():
    dados = consultar(
        "SELECT id_esta, nome_esta FROM tbl_estabelecimento "
        "WHERE tipo_esta NOT LIKE 'Residência de Acolhimento'")
    return jsonify(dados)


@app.get("/api/equipamentos/<int:id_esta>")
@login_obrigatorio
def obter_equipamento(id_esta):
    dado = consultar("SELECT id_esta, nome_esta FROM tbl_estabelecimento WHERE id_esta = %s",
                     (id_esta,), um=True)
    if not dado:
        return erro("Equipamento não encontrado.", 404)
    return jsonify(dado)


# ---------------------------------------------------------------------
# API - Acolhidos
# ---------------------------------------------------------------------
@app.get("/api/equipamentos/<int:id_esta>/acolhidos")
@login_obrigatorio
def listar_acolhidos(id_esta):
    dados = consultar(
        "SELECT id_acolhido, nome_acolhido, cpf, data_nasc, cid FROM tbl_acolhido "
        "WHERE fk_nome_esta = %s ORDER BY nome_acolhido", (id_esta,))
    return jsonify(serializar(dados))


@app.post("/api/equipamentos/<int:id_esta>/acolhidos")
@permissao("criar")
def inserir_acolhido(id_esta):
    d = request.get_json(silent=True) or {}
    nome = (d.get("nome") or "").strip()
    cpf = (d.get("cpf") or "").replace(".", "").replace("-", "").strip()
    cid = (d.get("cid") or "").strip() or None
    if not nome:
        return erro("Informe o nome.")
    if len(cpf) != 11 or not cpf.isdigit():
        return erro("CPF inválido! Digite exatamente 11 números.")
    try:
        data_bd = data_br_para_bd(d.get("data_nasc"))
    except ValueError as e:
        return erro(str(e))
    sql = ("INSERT INTO tbl_acolhido (nome_acolhido, cpf, data_nasc, cid, fk_nome_esta) "
           "VALUES (%s,%s,%s,%s,%s)")
    try:
        _, novo_id = executar(sql, (nome, cpf, data_bd, cid, id_esta))
    except mysql.connector.Error:
        return erro("Erro ao inserir! CPF já cadastrado ou dados inválidos.")
    return jsonify({"mensagem": "1 registro inserido.", "id": novo_id}), 201


@app.get("/api/acolhidos/<int:id_acolhido>")
@login_obrigatorio
def informacoes_cadastrais(id_acolhido):
    dado = consultar(
        "SELECT a.id_acolhido, a.nome_acolhido, a.cpf, a.data_nasc, a.cid, a.fk_nome_esta, e.nome_esta "
        "FROM tbl_acolhido a INNER JOIN tbl_estabelecimento e ON a.fk_nome_esta = e.id_esta "
        "WHERE a.id_acolhido = %s", (id_acolhido,), um=True)
    if not dado:
        return erro("Acolhido não encontrado.", 404)
    return jsonify(serializar(dado))


@app.put("/api/acolhidos/<int:id_acolhido>")
@permissao("editar")
def alterar_acolhido(id_acolhido):
    d = request.get_json(silent=True) or {}
    nome = (d.get("nome") or "").strip()
    cpf = (d.get("cpf") or "").replace(".", "").replace("-", "").strip()
    cid = (d.get("cid") or "").strip() or None
    if not nome:
        return erro("Informe o nome.")
    if len(cpf) != 11 or not cpf.isdigit():
        return erro("CPF inválido! Digite exatamente 11 números.")
    try:
        data_bd = data_br_para_bd(d.get("data_nasc"))
    except ValueError as e:
        return erro(str(e))
    sql = ("UPDATE tbl_acolhido SET nome_acolhido = %s, cpf = %s, data_nasc = %s, cid = %s "
           "WHERE id_acolhido = %s")
    try:
        linhas, _ = executar(sql, (nome, cpf, data_bd, cid, id_acolhido))
    except mysql.connector.Error:
        return erro("Erro ao alterar! Verifique os dados e tente novamente.")
    return jsonify({"mensagem": f"{linhas} registro(s) alterado(s)."})


@app.delete("/api/acolhidos/<int:id_acolhido>")
@permissao("excluir")
def excluir_acolhido(id_acolhido):
    try:
        linhas, _ = executar("DELETE FROM tbl_acolhido WHERE id_acolhido = %s", (id_acolhido,))
    except mysql.connector.Error:
        return erro("Erro ao excluir. Tente novamente!")
    return jsonify({"mensagem": f"{linhas} registro(s) excluído(s)."})


# ---------------------------------------------------------------------
# API - Medicação do acolhido
# ---------------------------------------------------------------------
@app.get("/api/acolhidos/<int:id_acolhido>/medicacoes")
@login_obrigatorio
def listar_acolhido_medicacao(id_acolhido):
    dados = consultar(
        "SELECT am.id_acol_med, m.nome_med, am.data_inicio, am.data_fim, am.frequencia, am.observacao "
        "FROM tbl_acolhido_medicacao am "
        "INNER JOIN tbl_medicacao m ON am.fk_med = m.id_med "
        "WHERE am.fk_acolhido = %s ORDER BY m.nome_med", (id_acolhido,))
    return jsonify(serializar(dados))


@app.post("/api/acolhidos/<int:id_acolhido>/medicacoes")
@permissao("criar")
def inserir_acolhido_medicacao(id_acolhido):
    d = request.get_json(silent=True) or {}
    try:
        fk_med = int(d.get("medicacao"))
    except (TypeError, ValueError):
        return erro("Selecione a medicação.")
    try:
        data_inicio = data_br_para_bd(d.get("data_inicio"))
        data_fim = data_br_para_bd(d.get("data_fim"), obrigatoria=False)  # vazio = uso contínuo
    except ValueError as e:
        return erro(str(e))
    sql = ("INSERT INTO tbl_acolhido_medicacao "
           "(fk_acolhido, fk_med, data_inicio, data_fim, frequencia, observacao) "
           "VALUES (%s,%s,%s,%s,%s,%s)")
    valores = (id_acolhido, fk_med, data_inicio, data_fim,
               (d.get("frequencia") or "").strip() or None,
               (d.get("observacao") or "").strip() or None)
    try:
        executar(sql, valores)
    except mysql.connector.Error:
        return erro("Erro ao inserir! Verifique os dados e tente novamente.")
    return jsonify({"mensagem": "1 registro inserido."}), 201


@app.delete("/api/acolhido-medicacao/<int:id_acol_med>")
@permissao("excluir")
def excluir_acolhido_medicacao(id_acol_med):
    try:
        linhas, _ = executar("DELETE FROM tbl_acolhido_medicacao WHERE id_acol_med = %s",
                             (id_acol_med,))
    except mysql.connector.Error:
        return erro("Erro ao excluir. Tente novamente!")
    return jsonify({"mensagem": f"{linhas} registro(s) excluído(s)."})


# ---------------------------------------------------------------------
# API - Exames e Consultas
# ---------------------------------------------------------------------
@app.get("/api/acolhidos/<int:id_acolhido>/consultas")
@login_obrigatorio
def listar_consulta_exame(id_acolhido):
    dados = consultar(
        "SELECT c.id_cons, e.nome_esta, c.data_cons, c.hora_cons, c.tipo_cons "
        "FROM tbl_consulta_exame c "
        "INNER JOIN tbl_estabelecimento e ON c.fk_nome_esta = e.id_esta "
        "WHERE c.fk_acolhido = %s ORDER BY c.data_cons, c.hora_cons", (id_acolhido,))
    return jsonify(serializar(dados))


@app.post("/api/acolhidos/<int:id_acolhido>/consultas")
@permissao("criar")
def inserir_consulta_exame(id_acolhido):
    d = request.get_json(silent=True) or {}
    try:
        fk_nome_esta = int(d.get("local"))
        data_bd = data_br_para_bd(d.get("data"))
        hora_bd = datetime.strptime((d.get("hora") or "").strip(), "%H:%M").strftime("%H:%M")
    except (TypeError, ValueError):
        return erro("Preencha local, data (dd/mm/aaaa) e hora (HH:MM) corretamente.")
    tipo = (d.get("tipo") or "").strip() or None
    sql = ("INSERT INTO tbl_consulta_exame (fk_acolhido, fk_nome_esta, data_cons, hora_cons, tipo_cons) "
           "VALUES (%s,%s,%s,%s,%s)")
    try:
        executar(sql, (id_acolhido, fk_nome_esta, data_bd, hora_bd, tipo))
    except mysql.connector.Error:
        return erro("Erro ao inserir! Verifique os dados e tente novamente.")
    return jsonify({"mensagem": "1 registro inserido."}), 201


@app.delete("/api/consultas/<int:id_cons>")
@permissao("excluir")
def excluir_consulta_exame(id_cons):
    try:
        linhas, _ = executar("DELETE FROM tbl_consulta_exame WHERE id_cons = %s", (id_cons,))
    except mysql.connector.Error:
        return erro("Erro ao excluir. Tente novamente!")
    return jsonify({"mensagem": f"{linhas} registro(s) excluído(s)."})


@app.get("/api/equipamentos/<int:id_esta>/proximas-consultas")
@login_obrigatorio
def listar_proximos_exames_consultas(id_esta):
    dados = consultar(
        "SELECT a.nome_acolhido, e.nome_esta, c.data_cons, c.hora_cons, c.tipo_cons "
        "FROM tbl_consulta_exame c "
        "INNER JOIN tbl_acolhido a ON c.fk_acolhido = a.id_acolhido "
        "INNER JOIN tbl_estabelecimento e ON c.fk_nome_esta = e.id_esta "
        "WHERE a.fk_nome_esta = %s AND c.data_cons >= CURDATE() "
        "ORDER BY c.data_cons, c.hora_cons", (id_esta,))
    return jsonify(serializar(dados))


@app.get("/api/equipamentos/<int:id_esta>/relatorio-medicacoes")
@login_obrigatorio
def relatorio_medicacao(id_esta):
    dados = consultar(
        "SELECT a.nome_acolhido, m.nome_med, am.frequencia "
        "FROM tbl_acolhido_medicacao am "
        "INNER JOIN tbl_acolhido a ON am.fk_acolhido = a.id_acolhido "
        "INNER JOIN tbl_medicacao m ON am.fk_med = m.id_med "
        "WHERE a.fk_nome_esta = %s ORDER BY a.nome_acolhido", (id_esta,))
    return jsonify(serializar(dados))


# ---------------------------------------------------------------------
# API - Controle de Medicação (inventário global)
# ---------------------------------------------------------------------
@app.get("/api/medicacoes")
@login_obrigatorio
def listar_medicacao():
    return jsonify(consultar("SELECT id_med, nome_med, ean FROM tbl_medicacao ORDER BY id_med"))


def validar_medicacao(d):
    nome = (d.get("nome") or "").strip()
    ean = (d.get("ean") or "").strip()
    if not nome:
        raise ValueError("Informe o nome do medicamento (com dosagem).")
    if len(ean) != 13 or not ean.isdigit():
        raise ValueError("EAN inválido! O código de barras tem exatamente 13 números.")
    return nome, ean


@app.post("/api/medicacoes")
@permissao("criar")
def inserir_medicacao():
    try:
        nome, ean = validar_medicacao(request.get_json(silent=True) or {})
    except ValueError as e:
        return erro(str(e))
    try:
        executar("INSERT INTO tbl_medicacao (nome_med, ean) VALUES (%s,%s)", (nome, ean))
    except mysql.connector.Error:
        return erro("Erro ao inserir! EAN já cadastrado ou dados inválidos.")
    return jsonify({"mensagem": "1 registro inserido."}), 201


@app.put("/api/medicacoes/<int:id_med>")
@permissao("editar")
def alterar_medicacao(id_med):
    try:
        nome, ean = validar_medicacao(request.get_json(silent=True) or {})
    except ValueError as e:
        return erro(str(e))
    try:
        linhas, _ = executar("UPDATE tbl_medicacao SET nome_med = %s, ean = %s WHERE id_med = %s",
                             (nome, ean, id_med))
    except mysql.connector.Error:
        return erro("Erro ao alterar! EAN já cadastrado ou dados inválidos.")
    return jsonify({"mensagem": f"{linhas} registro(s) alterado(s)."})


@app.delete("/api/medicacoes/<int:id_med>")
@permissao("excluir")
def excluir_medicacao(id_med):
    try:
        linhas, _ = executar("DELETE FROM tbl_medicacao WHERE id_med = %s", (id_med,))
    except mysql.connector.Error:
        return erro("Erro ao excluir. Tente novamente!")
    return jsonify({"mensagem": f"{linhas} registro(s) excluído(s)."})


# ---------------------------------------------------------------------
# Erro de conexão com o banco -> mensagem clara na tela
# ---------------------------------------------------------------------
@app.errorhandler(mysql.connector.Error)
def erro_banco(e):
    print("Erro no MySQL:", e)
    return erro("Não foi possível falar com o banco de dados (VM 2). "
                "Verifique o IP no config.ini, a rede e o MySQL.", 503)


# ---------------------------------------------------------------------
# Execução: servidor Waitress (próprio para produção no Windows).
# Não depende do VS Code: é iniciado pelo iniciar-elosocial.bat.
# ---------------------------------------------------------------------
if __name__ == "__main__":
    from waitress import serve

    host = config.get("app", "host", fallback="0.0.0.0")
    porta = config.getint("app", "port", fallback=5000)
    print("=" * 60)
    print(f" Elo Social rodando em http://{host}:{porta}")
    print(f" Banco de dados: {DB['host']}:{DB['port']} / {DB['database']}")
    print(" Para parar: feche esta janela ou pressione Ctrl+C")
    print("=" * 60)
    serve(app, host=host, port=porta)
