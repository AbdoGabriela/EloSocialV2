/* Página de login */
document.getElementById("form-login").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const dados = lerFormulario(evento.target);
    if (!dados.email || !dados.senha) {
        mostrarAlerta("Preencha e-mail e senha.");
        return;
    }
    const botao = evento.target.querySelector("button");
    botao.disabled = true;
    try {
        await api("/api/login", "POST", dados);
        window.location.href = "/app";
    } catch (erro) {
        mostrarAlerta(erro.message);
        botao.disabled = false;
    }
});

// Mensagem vinda do cadastro (?cadastrado=1)
if (new URLSearchParams(location.search).get("cadastrado")) {
    mostrarAlerta("Cadastro realizado! Agora é só entrar.", "ok");
}

// "Esqueci a senha": ainda não funcional, mostra o balão de aviso
document.getElementById("link-esqueci").addEventListener("click", (evento) => {
    evento.preventDefault();
    const balao = document.getElementById("balao-esqueci");
    balao.classList.add("mostrar");
    clearTimeout(balao._timer);
    balao._timer = setTimeout(() => balao.classList.remove("mostrar"), 3000);
});
