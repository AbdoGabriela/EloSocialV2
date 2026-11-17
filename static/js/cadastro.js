/* Página de cadastro de usuário (funcionário) */
const form = document.getElementById("form-cadastro");

// Carrega os equipamentos (RI, SAICA, CPA) do banco
(async function carregarEquipamentos() {
    const select = document.getElementById("equipamento");
    try {
        const lista = await api("/api/equipamentos");
        select.innerHTML = '<option value="">Selecione</option>' +
            lista.map(e => `<option value="${e.id_esta}">${esc(e.nome_esta)}</option>`).join("");
    } catch (erro) {
        select.innerHTML = '<option value="">Erro ao carregar</option>';
        mostrarAlerta(erro.message);
    }
})();

form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const dados = lerFormulario(form);

    if (!dados.nome || !dados.data_nasc || !dados.email || !dados.equipamento || !dados.ocupacao) {
        mostrarAlerta("Preencha todos os campos.");
        return;
    }
    if (dados.senha.length < 6) {
        mostrarAlerta("A senha precisa ter pelo menos 6 caracteres.");
        return;
    }
    if (dados.senha !== dados.confirma) {
        mostrarAlerta("As senhas não conferem.");
        return;
    }
    delete dados.confirma;

    const botao = form.querySelector("button");
    botao.disabled = true;
    try {
        await api("/api/usuarios", "POST", dados);
        window.location.href = "/?cadastrado=1";
    } catch (erro) {
        mostrarAlerta(erro.message);
        botao.disabled = false;
    }
});
