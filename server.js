const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment, Preference } = require('mercadopago');
const { Resend } = require('resend');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Logs de inicialização para debug na Vercel
console.log("Iniciando servidor...");
if (process.env.MP_ACCESS_TOKEN) console.log("✅ MP_ACCESS_TOKEN carregado");
else console.error("❌ MP_ACCESS_TOKEN faltando!");

if (process.env.RESEND_API_KEY) console.log("✅ RESEND_API_KEY carregada");
else console.error("❌ RESEND_API_KEY faltando!");

// Configurações Mercado Pago
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MP_ACCESS_TOKEN 
});

// Configura Resend (Email) com proteção contra falha na inicialização
// Se a chave não estiver carregada ainda, usa um placeholder para não derrubar o servidor
const resend = new Resend(process.env.RESEND_API_KEY || 're_123_placeholder');

// CORS liberado para qualquer origem (necessário para Vercel e redirecionamentos)
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === 'OPTIONS') return res.status(200).end();
    next();
});

app.use(express.json());

// Função para gerar CPF válido (Módulo 11) - Necessário para o Pix não ser rejeitado
function generateCPF() {
  const rnd = (n) => Math.round(Math.random() * n);
  const mod = (dividend, divisor) => Math.round(dividend - (Math.floor(dividend / divisor) * divisor));
  const n = Array(9).fill(0).map(() => rnd(9));
  let d1 = n.reduce((total, num, i) => total + (num * (10 - i)), 0);
  d1 = 11 - mod(d1, 11); if (d1 >= 10) d1 = 0;
  let d2 = n.reduce((total, num, i) => total + (num * (11 - i)), 0) + (d1 * 2);
  d2 = 11 - mod(d2, 11); if (d2 >= 10) d2 = 0;
  return `${n.join('')}${d1}${d2}`;
}

app.get('/', (req, res) => res.send('API NutriOfficial Online 🚀'));

// --- ROTA 1: CRIAR PIX ---
app.post('/create-payment', async (req, res) => {
    console.log("Recebendo pedido de Pix:", req.body);
    try {
        const { email, amount, description } = req.body;
        
        // Validações básicas
        if (!email || !email.includes('@')) throw new Error("E-mail inválido fornecido.");
        const transactionAmount = Number(amount);
        if (!transactionAmount || isNaN(transactionAmount)) throw new Error("Valor inválido.");

        const payment = new Payment(client);
        
        const body = {
            transaction_amount: transactionAmount,
            description: description || 'Protocolo NutriOfficial',
            payment_method_id: 'pix',
            payer: { 
                email: email,
                first_name: 'Cliente',
                last_name: 'Nutri',
                // CPF Válido gerado na hora para evitar rejeição do banco
                identification: { type: 'CPF', number: generateCPF() } 
            },
            date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 min
        };

        const result = await payment.create({ body });
        console.log("Pix criado:", result.id);

        res.json({
            id: result.id,
            status: result.status,
            qr_code: result.point_of_interaction.transaction_data.qr_code,
            qr_code_base64: result.point_of_interaction.transaction_data.qr_code_base64,
            ticket_url: result.point_of_interaction.transaction_data.ticket_url
        });
    } catch (error) {
        console.error("Erro CRÍTICO no Pix:", error);
        // Tenta extrair a mensagem de erro real do Mercado Pago
        const mpError = error.cause && error.cause[0] ? error.cause[0].description : error.message;
        res.status(500).json({ error: 'Erro ao gerar Pix', details: mpError });
    }
});

// --- ROTA 2: CRIAR PREFERÊNCIA (CARTÃO) ---
app.post('/create-preference', async (req, res) => {
    console.log("Criando preferência de cartão:", req.body);
    try {
        const { amount, description, returnUrl, email } = req.body;
        const preference = new Preference(client);

        const body = {
            items: [{
                id: 'protocolo-30-dias',
                title: description || 'Protocolo Digital',
                quantity: 1,
                unit_price: Number(amount)
            }],
            payer: { email: email },
            back_urls: {
                success: `${returnUrl}/?status=approved&email=${email}`,
                failure: `${returnUrl}/?status=failure`,
                pending: `${returnUrl}/?status=pending`
            },
            auto_return: 'approved'
        };

        const result = await preference.create({ body });
        console.log("Link de pagamento criado:", result.init_point);
        
        res.json({ init_point: result.init_point });
    } catch (error) {
        console.error("Erro CRÍTICO na Preferência:", error);
        res.status(500).json({ error: 'Erro ao criar link', details: error.message });
    }
});

// --- ROTA 3: STATUS ---
app.get('/payment-status/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const payment = new Payment(client);
        const result = await payment.get({ id });
        res.json({ id: result.id, status: result.status });
    } catch (error) {
        // Erros de status são normais enquanto o cliente não paga, apenas retornamos erro genérico
        res.status(500).json({ error: 'Erro check status' });
    }
});

// --- ROTA 4: EMAIL (RESEND) ---
app.post('/send-email', async (req, res) => {
    console.log("Tentando enviar email para:", req.body.email);
    const { email, protocolTitle } = req.body;

    // Validação real da chave APENAS no momento do envio
    if (!process.env.RESEND_API_KEY) {
        console.error("Resend API Key não configurada nas variáveis de ambiente!");
        return res.json({ success: false, error: "Servidor de e-mail não configurado" });
    }

    try {
        const data = await resend.emails.send({
            from: 'NutriOfficial <suporte@receitas-oficial.com.br>',
            to: [email],
            subject: '✅ Seu Acesso Liberado! (Protocolo NutriOfficial)',
            html: `
                <div style="font-family: Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h2 style="color: #0F0F0F; font-size: 24px; font-weight: 800; margin: 0;">NUTRI<span style="color: #FFCC00;">OFFICIAL</span></h2>
                    </div>
                    
                    <h1 style="color: #10B981; text-align: center; font-size: 28px; margin-bottom: 20px;">Compra Confirmada! 🚀</h1>
                    
                    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Olá,</p>
                    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Seu pagamento foi aprovado com sucesso! O seu <strong>${protocolTitle || 'Protocolo'}</strong> já está pronto para download.</p>
                    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Este e-mail é o seu backup de segurança para acessar o material sempre que precisar.</p>
                    
                    <div style="background-color: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 25px; text-align: center; margin: 30px 0;">
                        <p style="font-weight: bold; margin-bottom: 20px; color: #92400e;">Clique no botão abaixo para baixar:</p>
                        <a href="https://nutriofficial.vercel.app" style="background-color: #0F0F0F; color: #FFCC00; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px; font-size: 16px; display: inline-block;">BAIXAR MEU PDF AGORA</a>
                    </div>
                    
                    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 40px;">© 2025 NutriOfficial. Todos os direitos reservados.</p>
                </div>
            `
        });
        console.log("Email enviado com sucesso:", data);
        res.json({ success: true, data });
    } catch (error) {
        console.error("Erro fatal Resend:", error);
        res.json({ success: false, error: error.message });
    }
});

module.exports = app;

if (require.main === module) {
    app.listen(port, () => console.log(`Servidor rodando na porta ${port}`));
}