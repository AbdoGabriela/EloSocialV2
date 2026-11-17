/* Funções usadas em todas as páginas do Elo Social */

// Chama a API do backend (Python) e devolve o JSON da resposta
async function api(url, metodo = "GET", dados = null) {
    const opcoes = { method: metodo, headers: {} };
    if (dados) {
        opcoes.headers["Content-Type"] = "application/json";
        opcoes.body = JSON.stringify(dados);
    }
    const resposta = await fetch(url, opcoes);
    let corpo = {};
    try { corpo = await resposta.json(); } catch (e) { /* resposta sem JSON */ }
    if (resposta.status === 401 && !url.includes("/api/login")) {
        window.location.href = "/";
        throw new Error("Sessão expirada.");
    }
    if (!resposta.ok) throw new Error(corpo.erro || "Erro inesperado. Tente novamente.");
    return corpo;
}

// Lê os campos de um formulário como objeto { nome: valor }
function lerFormulario(form) {
    return Object.fromEntries(new FormData(form).entries());
}

// Mostra mensagem na caixa de alerta da página
function mostrarAlerta(texto, tipo = "erro") {
    const caixa = document.getElementById("alerta");
    caixa.textContent = texto;
    caixa.className = `alerta mostrar ${tipo}`;
}

// Evita que textos vindos do banco virem HTML na página
function esc(valor) {
    if (valor === null || valor === undefined || valor === "") return "—";
    return String(valor).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

// 12345678912 -> 123.456.789-12
function formatarCpf(cpf) {
    const n = String(cpf || "").replace(/\D/g, "");
    return n.length === 11 ? n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : esc(cpf);
}

// dd/mm/aaaa -> aaaa-mm-dd (para preencher <input type="date">)
function dataParaInput(br) {
    if (!br || !br.includes("/")) return "";
    const [d, m, a] = br.split("/");
    return `${a}-${m}-${d}`;
}
