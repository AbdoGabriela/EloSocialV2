/* =============================================================
   Elo Social - Sistema (dashboard, equipamentos, acolhidos, medicação)
   As telas são trocadas pelo endereço (#/...) sem recarregar a página.
   ============================================================= */
const conteudo = document.getElementById("conteudo");
let usuario = null;         // dados de quem está logado
let pode = {};              // permissões: ler, criar, editar, excluir

const EQUIPAMENTOS = {
    1: { icone: "🏠", descricao: "Jovens e adultos com deficiência, de 18 a 60 anos" },
    2: { icone: "👶", descricao: "Crianças e adolescentes de 0 a 18 anos" },
    3: { icone: "🏛️", descricao: "Adultos e famílias em situação de rua, de 18 a 60 anos" },
};

/* ---------------- Utilidades de tela ---------------- */
function toast(texto, tipo = "") {
    const t = document.getElementById("toast");
    t.textContent = texto;
    t.className = `toast mostrar ${tipo}`;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => (t.className = "toast"), 3200);
}

function avisoSomenteLeitura() {
    if (pode.criar || pode.editar) return "";
    return `<div class="aviso-leitura">Perfil <b>${esc(usuario.ocupacao)}</b>: acesso somente para consulta.</div>`;
}

function botaoExcluir(atributos) {
    return pode.excluir ? `<button class="btn btn-perigo btn-pequeno" ${atributos}>Excluir</button>` : "";
}

function marcarMenu(rota) {
    document.querySelectorAll(".sidebar a.item").forEach(a =>
        a.classList.toggle("ativo", a.dataset.rota === rota));
}

/* ---------------- Modal genérico ---------------- */
const modal = {
    fundo: document.getElementById("modal-fundo"),
    form: document.getElementById("modal-form"),
    aoSalvar: null,

    abrir(titulo, camposHtml, aoSalvar) {
        document.getElementById("modal-titulo").textContent = titulo;
        document.getElementById("modal-campos").innerHTML = camposHtml;
        document.getElementById("alerta").className = "alerta";
        this.aoSalvar = aoSalvar;
        this.fundo.classList.add("aberto");
        const primeiro = this.form.querySelector("input, select");
        if (primeiro) primeiro.focus();
    },
    fechar() {
        this.fundo.classList.remove("aberto");
        this.form.reset();
    },
};

modal.form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const botao = document.getElementById("modal-salvar");
    botao.disabled = true;
    try {
        const resposta = await modal.aoSalvar(lerFormulario(modal.form));
        modal.fechar();
        toast(resposta.mensagem || "Salvo!");
        rotear();
    } catch (erro) {
        mostrarAlerta(erro.message);
    } finally {
        botao.disabled = false;
    }
});
document.getElementById("modal-cancelar").addEventListener("click", () => modal.fechar());
modal.fundo.addEventListener("click", (e) => { if (e.target === modal.fundo) modal.fechar(); });

async function confirmarExclusao(texto, url) {
    if (!confirm(`Você confirma a exclusão de ${texto}?`)) return;
    try {
        const resposta = await api(url, "DELETE");
        toast(resposta.mensagem);
        rotear();
    } catch (erro) {
        toast(erro.message, "erro");
    }
}

/* =============================================================
   TELA: Dashboard
   ============================================================= */
async function telaDashboard() {
    marcarMenu("dashboard");
    const equipamentos = await api("/api/equipamentos");
    const cards = equipamentos.map(e => {
        const info = EQUIPAMENTOS[e.id_esta] || { icone: "🏠", descricao: "" };
        const meu = e.id_esta === usuario.id_equipamento;
        return `
        <div class="card ${meu ? "meu" : ""}" onclick="location.hash='#/equipamento/${e.id_esta}'">
            <div class="icone">${info.icone}</div>
            ${meu ? '<div class="tag-meu">SEU EQUIPAMENTO</div>' : ""}
            <h3>${esc(e.nome_esta)}</h3>
            <p>${esc(info.descricao)}</p>
            <span class="seta">→</span>
        </div>`;
    }).join("");

    conteudo.innerHTML = `
    <section>
        <h1 class="titulo">Bem-vindo ao EloSocial</h1>
        <p class="subtitulo">Olá, ${esc(usuario.nome.split(" ")[0])}! Selecione um módulo para gerenciar</p>
        <div class="cards">
            ${cards}
            <div class="card" onclick="location.hash='#/medicacao'">
                <div class="icone">💊</div>
                <h3>Medicações</h3>
                <p>Controle do inventário de medicamentos</p>
                <span class="seta">→</span>
            </div>
        </div>
    </section>`;
}

/* =============================================================
   TELA: Equipamento (abas: Acolhidos / Próximas Consultas / Relatório)
   ============================================================= */
async function telaEquipamento(idEsta, aba = "acolhidos") {
    marcarMenu(`equipamento-${idEsta}`);
    const equip = await api(`/api/equipamentos/${idEsta}`);

    conteudo.innerHTML = `
    <section>
        <div class="migalha"><a href="#/">Dashboard</a><span>›</span>${esc(equip.nome_esta)}</div>
        <h1 class="titulo" style="margin-bottom:24px">${esc(equip.nome_esta)}</h1>
        ${avisoSomenteLeitura()}
        <div class="abas">
            <button class="aba ${aba === "acolhidos" ? "ativa" : ""}" data-aba="acolhidos">Acolhidos</button>
            <button class="aba ${aba === "consultas" ? "ativa" : ""}" data-aba="consultas">Próximas Consultas</button>
            <button class="aba ${aba === "relatorio" ? "ativa" : ""}" data-aba="relatorio">Relatório de Medicações</button>
        </div>
        <div id="area-aba"></div>
    </section>`;

    conteudo.querySelectorAll(".aba").forEach(b => b.addEventListener("click", () => {
        location.hash = `#/equipamento/${idEsta}/${b.dataset.aba}`;
    }));

    const area = document.getElementById("area-aba");
    if (aba === "consultas") return abaProximasConsultas(idEsta, area);
    if (aba === "relatorio") return abaRelatorio(idEsta, area);
    return abaAcolhidos(idEsta, area);
}

async function abaAcolhidos(idEsta, area) {
    const lista = await api(`/api/equipamentos/${idEsta}/acolhidos`);
    const linhas = lista.length ? lista.map(a => `
        <tr>
            <td class="link" onclick="location.hash='#/acolhido/${a.id_acolhido}'">${esc(a.nome_acolhido)}</td>
            <td>${formatarCpf(a.cpf)}</td>
            <td>${esc(a.data_nasc)}</td>
            <td>${esc(a.cid)}</td>
            <td class="acoes">
                <button class="btn btn-secundario btn-pequeno" onclick="location.hash='#/acolhido/${a.id_acolhido}'">Abrir</button>
                ${botaoExcluir(`data-excluir-acolhido="${a.id_acolhido}" data-nome="${esc(a.nome_acolhido)}"`)}
            </td>
        </tr>`).join("") : `<tr><td colspan="5" class="vazio">Nenhum registro encontrado.</td></tr>`;

    area.innerHTML = `
        <div class="cabecalho-secao">
            <h2>Acolhidos</h2>
            ${pode.criar ? '<button class="btn btn-primario" id="novo-acolhido">+ Novo Acolhido</button>' : ""}
        </div>
        <div class="tabela-caixa"><table>
            <thead><tr><th>Nome</th><th>CPF</th><th>Data Nasc.</th><th>CID</th><th class="acoes">Ações</th></tr></thead>
            <tbody>${linhas}</tbody>
        </table></div>`;

    const botaoNovo = document.getElementById("novo-acolhido");
    if (botaoNovo) botaoNovo.addEventListener("click", () =>
        modal.abrir("Novo Acolhido", camposAcolhido(), dados =>
            api(`/api/equipamentos/${idEsta}/acolhidos`, "POST", dados)));

    area.querySelectorAll("[data-excluir-acolhido]").forEach(b => b.addEventListener("click", () =>
        confirmarExclusao(b.dataset.nome, `/api/acolhidos/${b.dataset.excluirAcolhido}`)));
}

function camposAcolhido(a = {}) {
    return `
        <div class="campo"><label>Nome completo</label>
            <input name="nome" maxlength="100" value="${a.nome_acolhido ? esc(a.nome_acolhido) : ""}" required></div>
        <div class="grade-2">
            <div class="campo"><label>CPF</label>
                <input name="cpf" maxlength="14" placeholder="000.000.000-00" value="${a.cpf || ""}" required></div>
            <div class="campo"><label>Data de nascimento</label>
                <input type="date" name="data_nasc" value="${dataParaInput(a.data_nasc)}" required></div>
        </div>
        <div class="campo"><label>CID</label>
            <input name="cid" maxlength="100" placeholder="Deixe vazio se não tiver" value="${a.cid ? esc(a.cid) : ""}"></div>`;
}

async function abaProximasConsultas(idEsta, area) {
    const lista = await api(`/api/equipamentos/${idEsta}/proximas-consultas`);
    const linhas = lista.length ? lista.map(c => `
        <tr>
            <td>${esc(c.nome_acolhido)}</td>
            <td><span class="selo">${esc(c.tipo_cons)}</span></td>
            <td>${esc(c.nome_esta)}</td>
            <td>${esc(c.data_cons)}</td>
            <td>${esc(c.hora_cons)}</td>
        </tr>`).join("") : `<tr><td colspan="5" class="vazio">Nenhum registro encontrado.</td></tr>`;
    area.innerHTML = `
        <div class="cabecalho-secao"><h2>Próximas Consultas e Exames</h2></div>
        <div class="tabela-caixa"><table>
            <thead><tr><th>Acolhido</th><th>Tipo</th><th>Local</th><th>Data</th><th>Hora</th></tr></thead>
            <tbody>${linhas}</tbody>
        </table></div>`;
}

async function abaRelatorio(idEsta, area) {
    const lista = await api(`/api/equipamentos/${idEsta}/relatorio-medicacoes`);
    if (!lista.length) {
        area.innerHTML = `<div class="cabecalho-secao"><h2>Relatório de Medicações</h2></div>
            <div class="tabela-caixa"><table><tbody><tr><td class="vazio">Nenhum registro encontrado.</td></tr></tbody></table></div>`;
        return;
    }
    // Agrupa por acolhido (igual ao relatório do terminal)
    const grupos = {};
    lista.forEach(l => (grupos[l.nome_acolhido] ||= []).push(l));
    area.innerHTML = `<div class="cabecalho-secao"><h2>Relatório de Medicações</h2></div>` +
        Object.entries(grupos).map(([nome, meds]) => `
            <div class="relatorio-grupo">
                <h4>${esc(nome)}</h4>
                <ul>${meds.map(m => `<li><b>${esc(m.nome_med)}</b> → ${esc(m.frequencia)}</li>`).join("")}</ul>
            </div>`).join("");
}

/* =============================================================
   TELA: Acolhido (ficha, medicações, exames e consultas)
   ============================================================= */
async function telaAcolhido(idAcolhido) {
    const [a, meds, consultas] = await Promise.all([
        api(`/api/acolhidos/${idAcolhido}`),
        api(`/api/acolhidos/${idAcolhido}/medicacoes`),
        api(`/api/acolhidos/${idAcolhido}/consultas`),
    ]);
    marcarMenu(`equipamento-${a.fk_nome_esta}`);

    const linhasMed = meds.length ? meds.map(m => `
        <tr>
            <td><b>${esc(m.nome_med)}</b></td>
            <td>${esc(m.frequencia)}</td>
            <td>${esc(m.data_inicio)}</td>
            <td>${m.data_fim ? esc(m.data_fim) : '<span class="selo">Uso contínuo</span>'}</td>
            <td>${esc(m.observacao)}</td>
            <td class="acoes">${botaoExcluir(`data-excluir-med="${m.id_acol_med}" data-nome="${esc(m.nome_med)}"`)}</td>
        </tr>`).join("") : `<tr><td colspan="6" class="vazio">Nenhum registro encontrado.</td></tr>`;

    const linhasCons = consultas.length ? consultas.map(c => `
        <tr>
            <td><span class="selo">${esc(c.tipo_cons)}</span></td>
            <td>${esc(c.nome_esta)}</td>
            <td>${esc(c.data_cons)}</td>
            <td>${esc(c.hora_cons)}</td>
            <td class="acoes">${botaoExcluir(`data-excluir-cons="${c.id_cons}" data-nome="${esc(c.tipo_cons)} de ${esc(c.data_cons)}"`)}</td>
        </tr>`).join("") : `<tr><td colspan="5" class="vazio">Nenhum registro encontrado.</td></tr>`;

    conteudo.innerHTML = `
    <section>
        <div class="migalha">
            <a href="#/">Dashboard</a><span>›</span>
            <a href="#/equipamento/${a.fk_nome_esta}">${esc(a.nome_esta)}</a><span>›</span>${esc(a.nome_acolhido)}
        </div>
        <div class="cabecalho-secao">
            <h1 class="titulo">${esc(a.nome_acolhido)}</h1>
            ${pode.editar ? '<button class="btn btn-secundario" id="editar-acolhido">✏️ Alterar dados</button>' : ""}
        </div>
        ${avisoSomenteLeitura()}
        <div class="ficha">
            <div><div class="rotulo">CPF</div><div class="valor">${formatarCpf(a.cpf)}</div></div>
            <div><div class="rotulo">Data de nascimento</div><div class="valor">${esc(a.data_nasc)}</div></div>
            <div><div class="rotulo">CID</div><div class="valor">${esc(a.cid)}</div></div>
            <div><div class="rotulo">Equipamento</div><div class="valor">${esc(a.nome_esta)}</div></div>
        </div>

        <div class="cabecalho-secao">
            <h2>Medicações</h2>
            ${pode.criar ? '<button class="btn btn-primario" id="nova-med">+ Inserir medicação</button>' : ""}
        </div>
        <div class="tabela-caixa" style="margin-bottom:32px"><table>
            <thead><tr><th>Medicamento</th><th>Frequência</th><th>Início</th><th>Fim</th><th>Observação</th><th class="acoes">Ações</th></tr></thead>
            <tbody>${linhasMed}</tbody>
        </table></div>

        <div class="cabecalho-secao">
            <h2>Exames e Consultas</h2>
            ${pode.criar ? '<button class="btn btn-primario" id="nova-cons">+ Inserir exame/consulta</button>' : ""}
        </div>
        <div class="tabela-caixa"><table>
            <thead><tr><th>Tipo</th><th>Local</th><th>Data</th><th>Hora</th><th class="acoes">Ações</th></tr></thead>
            <tbody>${linhasCons}</tbody>
        </table></div>
    </section>`;

    const id = (x) => document.getElementById(x);

    if (id("editar-acolhido")) id("editar-acolhido").addEventListener("click", () =>
        modal.abrir("Alterar dados do acolhido", camposAcolhido(a), dados =>
            api(`/api/acolhidos/${idAcolhido}`, "PUT", dados)));

    if (id("nova-med")) id("nova-med").addEventListener("click", async () => {
        const catalogo = await api("/api/medicacoes");
        if (!catalogo.length) return toast("Cadastre medicamentos em Controle de Medicação primeiro.", "erro");
        modal.abrir("Inserir medicação", `
            <div class="campo"><label>Medicamento</label>
                <select name="medicacao" required><option value="">Selecione</option>
                ${catalogo.map(m => `<option value="${m.id_med}">${esc(m.nome_med)}</option>`).join("")}
                </select></div>
            <div class="grade-2">
                <div class="campo"><label>Data de início</label><input type="date" name="data_inicio" required></div>
                <div class="campo"><label>Data de fim</label><input type="date" name="data_fim">
                    <span class="dica">Deixe vazio se for uso contínuo</span></div>
            </div>
            <div class="campo"><label>Frequência / horário</label>
                <input name="frequencia" maxlength="50" placeholder="ex: 2x ao dia, 8h e 20h"></div>
            <div class="campo"><label>Observações</label>
                <textarea name="observacao" maxlength="255" rows="2"></textarea></div>`,
            dados => api(`/api/acolhidos/${idAcolhido}/medicacoes`, "POST", dados));
    });

    if (id("nova-cons")) id("nova-cons").addEventListener("click", async () => {
        const locais = await api("/api/locais");
        modal.abrir("Inserir exame ou consulta", `
            <div class="campo"><label>Tipo</label>
                <select name="tipo" required>
                    <option value="Consulta">Consulta</option>
                    <option value="Exame">Exame</option>
                </select></div>
            <div class="campo"><label>Local</label>
                <select name="local" required><option value="">Selecione</option>
                ${locais.map(l => `<option value="${l.id_esta}">${esc(l.nome_esta)}</option>`).join("")}
                </select></div>
            <div class="grade-2">
                <div class="campo"><label>Data</label><input type="date" name="data" required></div>
                <div class="campo"><label>Hora</label><input type="time" name="hora" required></div>
            </div>`,
            dados => api(`/api/acolhidos/${idAcolhido}/consultas`, "POST", dados));
    });

    conteudo.querySelectorAll("[data-excluir-med]").forEach(b => b.addEventListener("click", () =>
        confirmarExclusao(b.dataset.nome, `/api/acolhido-medicacao/${b.dataset.excluirMed}`)));
    conteudo.querySelectorAll("[data-excluir-cons]").forEach(b => b.addEventListener("click", () =>
        confirmarExclusao(b.dataset.nome, `/api/consultas/${b.dataset.excluirCons}`)));
}

/* =============================================================
   TELA: Controle de Medicação (inventário global)
   ============================================================= */
async function telaMedicacao() {
    marcarMenu("medicacao");
    const lista = await api("/api/medicacoes");
    const linhas = lista.length ? lista.map(m => `
        <tr>
            <td style="color:var(--texto-3)">${m.id_med}</td>
            <td><b>${esc(m.nome_med)}</b></td>
            <td class="mono">${esc(m.ean)}</td>
            <td class="acoes">
                ${pode.editar ? `<button class="btn btn-secundario btn-pequeno" data-editar-med="${m.id_med}">✏️ Editar</button>` : ""}
                ${botaoExcluir(`data-excluir-med="${m.id_med}" data-nome="${esc(m.nome_med)}"`)}
            </td>
        </tr>`).join("") : `<tr><td colspan="4" class="vazio">Nenhum registro encontrado.</td></tr>`;

    conteudo.innerHTML = `
    <section>
        <h1 class="titulo">Controle de Medicação</h1>
        <p class="subtitulo">Inventário global de medicamentos</p>
        ${avisoSomenteLeitura()}
        <div class="cabecalho-secao">
            <h2>Medicamentos cadastrados</h2>
            ${pode.criar ? '<button class="btn btn-primario" id="novo-med">+ Novo Medicamento</button>' : ""}
        </div>
        <div class="tabela-caixa"><table>
            <thead><tr><th>#</th><th>Nome</th><th>EAN (Código de barras)</th><th class="acoes">Ações</th></tr></thead>
            <tbody>${linhas}</tbody>
        </table></div>
    </section>`;

    const campos = (m = {}) => `
        <div class="campo"><label>Nome do medicamento (com dosagem)</label>
            <input name="nome" maxlength="100" placeholder="ex: Losartana 50mg Neo Química" value="${m.nome_med ? esc(m.nome_med) : ""}" required></div>
        <div class="campo"><label>EAN (código de barras)</label>
            <input name="ean" maxlength="13" inputmode="numeric" placeholder="13 números" value="${m.ean || ""}" required></div>`;

    const botaoNovo = document.getElementById("novo-med");
    if (botaoNovo) botaoNovo.addEventListener("click", () =>
        modal.abrir("Novo Medicamento", campos(), dados => api("/api/medicacoes", "POST", dados)));

    conteudo.querySelectorAll("[data-editar-med]").forEach(b => b.addEventListener("click", () => {
        const m = lista.find(x => x.id_med == b.dataset.editarMed);
        modal.abrir("Editar Medicamento", campos(m), dados => api(`/api/medicacoes/${m.id_med}`, "PUT", dados));
    }));
    conteudo.querySelectorAll("[data-excluir-med]").forEach(b => b.addEventListener("click", () =>
        confirmarExclusao(b.dataset.nome, `/api/medicacoes/${b.dataset.excluirMed}`)));
}

/* =============================================================
   SENHAS: alterar a própria + tela do Coordenador (redefinir)
   ============================================================= */
const camposNovaSenha = `
    <div class="grade-2">
        <div class="campo"><label>Nova senha</label>
            <input type="password" name="nova_senha" minlength="6" autocomplete="new-password" required>
            <span class="dica">Mínimo de 6 caracteres</span></div>
        <div class="campo"><label>Confirmar nova senha</label>
            <input type="password" name="confirma" autocomplete="new-password" required></div>
    </div>`;

function conferirNovaSenha(dados) {
    if ((dados.nova_senha || "").length < 6) throw new Error("A nova senha precisa ter pelo menos 6 caracteres.");
    if (dados.nova_senha !== dados.confirma) throw new Error("As senhas não conferem.");
    delete dados.confirma;
    return dados;
}

document.getElementById("botao-senha").addEventListener("click", () =>
    modal.abrir("Alterar minha senha", `
        <div class="campo"><label>Senha atual</label>
            <input type="password" name="senha_atual" autocomplete="current-password" required></div>
        ${camposNovaSenha}`,
        dados => api("/api/me/senha", "PUT", conferirNovaSenha(dados))));

async function telaUsuarios() {
    marcarMenu("usuarios");
    const lista = await api("/api/usuarios");
    const linhas = lista.length ? lista.map(u => `
        <tr>
            <td><b>${esc(u.nome_usuario)}</b></td>
            <td class="mono">${esc(u.email)}</td>
            <td><span class="selo">${esc(u.ocupacao)}</span></td>
            <td>${esc(u.nome_esta)}</td>
            <td class="acoes">
                <button class="btn btn-secundario btn-pequeno" data-redefinir="${u.id_usuario}" data-nome="${esc(u.nome_usuario)}">🔑 Redefinir senha</button>
            </td>
        </tr>`).join("") : `<tr><td colspan="5" class="vazio">Nenhum registro encontrado.</td></tr>`;

    conteudo.innerHTML = `
    <section>
        <h1 class="titulo">Usuários e senhas</h1>
        <p class="subtitulo">Funcionários com acesso ao sistema. Se alguém esquecer a senha, defina aqui uma senha provisória e passe a ela pessoalmente.</p>
        <div class="tabela-caixa"><table>
            <thead><tr><th>Nome</th><th>E-mail</th><th>Ocupação</th><th>Equipamento</th><th class="acoes">Ações</th></tr></thead>
            <tbody>${linhas}</tbody>
        </table></div>
    </section>`;

    conteudo.querySelectorAll("[data-redefinir]").forEach(b => b.addEventListener("click", () =>
        modal.abrir(`Redefinir senha de ${b.dataset.nome}`, camposNovaSenha,
            dados => api(`/api/usuarios/${b.dataset.redefinir}/senha`, "PUT", conferirNovaSenha(dados)))));
}

/* =============================================================
   Navegação
   ============================================================= */
async function rotear() {
    const partes = location.hash.replace(/^#\/?/, "").split("/");
    try {
        if (partes[0] === "equipamento" && partes[1]) await telaEquipamento(Number(partes[1]), partes[2]);
        else if (partes[0] === "acolhido" && partes[1]) await telaAcolhido(Number(partes[1]));
        else if (partes[0] === "medicacao") await telaMedicacao();
        else if (partes[0] === "usuarios" && usuario.ocupacao === "Coordenador") await telaUsuarios();
        else await telaDashboard();
    } catch (erro) {
        conteudo.innerHTML = `<section><h1 class="titulo">Ops!</h1>
            <div class="alerta mostrar erro">${esc(erro.message)}</div></section>`;
    }
}

document.getElementById("botao-sair").addEventListener("click", async () => {
    await api("/api/logout", "POST");
    window.location.href = "/";
});

(async function iniciar() {
    usuario = await api("/api/me");
    pode = usuario.permissoes;
    document.getElementById("usuario-nome").textContent = usuario.nome;
    document.getElementById("usuario-equipamento").textContent = usuario.equipamento;
    document.getElementById("usuario-ocupacao").textContent = usuario.ocupacao;
    document.getElementById("menu-admin").hidden = usuario.ocupacao !== "Coordenador";
    window.addEventListener("hashchange", rotear);
    rotear();
})();
