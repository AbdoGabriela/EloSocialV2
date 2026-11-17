-- =====================================================================
-- Elo Social - Script do Banco de Dados (versão web - AC4)
-- Executar na VM 2 (MySQL)
-- Baseado no EloSocial_BD_Final.sql + tabela de usuários do sistema
-- =====================================================================

SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS 02_EloSocial
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;
USE 02_EloSocial;

-- Tabela 01 - Estabelecimento - Tabela ADM
CREATE TABLE IF NOT EXISTS tbl_estabelecimento (
    id_esta INT AUTO_INCREMENT PRIMARY KEY,
    nome_esta VARCHAR(100) NOT NULL,
    tipo_esta VARCHAR(100) -- ex: Residência de Acolhimento, UBS, Clínica, Hospital
);

-- Tabela 02 - Medicação
CREATE TABLE IF NOT EXISTS tbl_medicacao (
    id_med INT AUTO_INCREMENT PRIMARY KEY,
    ean VARCHAR(13) NOT NULL UNIQUE, -- "Código de Barras"
    nome_med VARCHAR(100) NOT NULL -- Nome do medicamento COM dosagem
);

-- Tabela 03 - Acolhido
CREATE TABLE IF NOT EXISTS tbl_acolhido (
    id_acolhido INT AUTO_INCREMENT PRIMARY KEY,
    nome_acolhido VARCHAR(100) NOT NULL,
    cpf CHAR(11) NOT NULL UNIQUE,
    data_nasc DATE NOT NULL,
    cid VARCHAR(100),
    fk_nome_esta INT NOT NULL,
    CONSTRAINT FOREIGN KEY (fk_nome_esta) REFERENCES tbl_estabelecimento (id_esta)
);

-- Tabela 04 - Consulta
CREATE TABLE IF NOT EXISTS tbl_consulta_exame (
    id_cons INT AUTO_INCREMENT PRIMARY KEY,
    fk_acolhido INT NOT NULL,
    fk_nome_esta INT,
    data_cons DATE NOT NULL,
    hora_cons TIME NOT NULL,
    tipo_cons VARCHAR(100),
    CONSTRAINT FOREIGN KEY (fk_nome_esta) REFERENCES tbl_estabelecimento (id_esta) ON DELETE CASCADE,
    CONSTRAINT FOREIGN KEY (fk_acolhido) REFERENCES tbl_acolhido (id_acolhido) ON DELETE CASCADE
);

-- Tabela 05 - relacionamento acolhido e medicação
CREATE TABLE IF NOT EXISTS tbl_acolhido_medicacao (
    id_acol_med INT AUTO_INCREMENT PRIMARY KEY,
    fk_acolhido INT NOT NULL,
    fk_med INT NOT NULL,
    data_inicio DATE NOT NULL,
    data_fim DATE, -- NULL = uso contínuo
    frequencia VARCHAR(50), -- ex: "2x ao dia"
    observacao VARCHAR(255),
    CONSTRAINT FOREIGN KEY (fk_acolhido) REFERENCES tbl_acolhido (id_acolhido) ON DELETE CASCADE,
    CONSTRAINT FOREIGN KEY (fk_med) REFERENCES tbl_medicacao (id_med) ON DELETE CASCADE
);

-- Tabela 06 - NOVA - Usuários do sistema (funcionários, não acolhidos)
-- Ocupação define o nível de acesso:
--   Coordenador ........................ CRUD completo
--   Assistente Social / Psicólogo ...... tudo, exceto excluir
--   Cuidador ........................... somente leitura
CREATE TABLE IF NOT EXISTS tbl_usuario (
    id_usuario INT AUTO_INCREMENT PRIMARY KEY,
    nome_usuario VARCHAR(100) NOT NULL,
    data_nasc DATE NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL, -- a senha nunca é gravada em texto puro
    fk_esta INT NOT NULL, -- equipamento em que trabalha
    ocupacao ENUM('Coordenador', 'Assistente Social', 'Cuidador', 'Psicólogo') NOT NULL,
    data_cadastro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FOREIGN KEY (fk_esta) REFERENCES tbl_estabelecimento (id_esta)
);


-- Inserção de Estabelecimentos (obrigatória: o sistema usa os IDs 1, 2 e 3
-- para RI, SAICA e CPA). Só insere se a tabela estiver vazia.
INSERT INTO tbl_estabelecimento (nome_esta, tipo_esta)
SELECT * FROM (
    SELECT 'Residência Inclusiva' AS nome_esta, 'Residência de Acolhimento' AS tipo_esta UNION ALL
    SELECT 'SAICA', 'Residência de Acolhimento' UNION ALL
    SELECT 'Centro Provisório de Acolhimento', 'Residência de Acolhimento' UNION ALL
    SELECT 'UBS Oliveira Marabá', 'UBS' UNION ALL
    SELECT 'Clínica Uchida', 'Clínica' UNION ALL
    SELECT 'AME', 'Centro Público de Saúde'
) AS dados
WHERE NOT EXISTS (SELECT 1 FROM tbl_estabelecimento);

-- Inserção de Medicamentos (exemplo, opcional)
INSERT IGNORE INTO tbl_medicacao (ean, nome_med) VALUES
('7896004716176', 'Hidroclorotiazida 25mg EMS'),
('7896714208565', 'Losartana 50mg Neo Química'),
('7896422514651', 'Clonazepam 2mg Medley');


-- =====================================================================
-- Usuário que a APLICAÇÃO (VM 1) usa para acessar o banco.
-- Troque 192.168.56.101 pelo IP real da VM 1 (Windows Server)
-- e troque a senha. Use a mesma senha no config.ini da aplicação.
-- =====================================================================
CREATE USER IF NOT EXISTS 'app_elosocial'@'192.168.56.101' IDENTIFIED BY 'SUA_SENHA_AQUI';
GRANT SELECT, INSERT, UPDATE, DELETE ON 02_EloSocial.* TO 'app_elosocial'@'192.168.56.101';
FLUSH PRIVILEGES;
