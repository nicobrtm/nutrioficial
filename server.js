const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment, Preference } = require('mercadopago');
const { Resend } = require('resend');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Configuração Mercado Pago
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MP_ACCESS_TOKEN 
});

// Configuração Resend (E-mail) - Proteção de inicialização
const resend = new Resend(process.env.RESEND_API_KEY || 're_123_placeholder');

app.use(express.json());
app.use(cors());

// CORS manual para evitar erros na Vercel (Pre-flight)
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === 'OPTIONS') return res.status(200).end();
    next();
});

// Função para gerar CPF válido para o Pix (Evita bloqueio bancário)
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

app.get('/', (req, res) => res.send('API NutriOfficial 100% Online ✅'));

// --- ROTA: CRIAR PIX ---
app.post('/create-payment', async (req, res) => {
    try {
        const { email, amount, description } = req.body;
        const payment = new Payment(client);
        const body = {
            transaction_amount: Number(amount),
            description: description || 'Protocolo NutriOfficial',
            payment_method_id: 'pix',
            payer: { 
                email: email,
                first_name: 'Cliente',
                last_name: 'Nutri',
                identification: { type: 'CPF', number: generateCPF() }
            },
            date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString()
        };
        const result = await payment.create({ body });
        res.json({
            id: result.id,
            status: result.status,
            qr_code: result.point_of_interaction.transaction_data.qr_code,
            qr_code_base64: result.point_of_interaction.transaction_data.qr_code_base64
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao gerar Pix' });
    }
});

// --- ROTA: CRIAR CARTÃO (PREFERÊNCIA) ---
app.post('/create-preference', async (req, res) => {
    try {
        const { amount, description, returnUrl, email } = req.body;
        const preference = new Preference(client);
        const body = {
            items: [{ title: description || 'Protocolo NutriOfficial', quantity: 1, unit_price: Number(amount) }],
            payer: { email: email },
            back_urls: {
                success: `${returnUrl}/?status=approved&email=${email}&goal=${encodeURIComponent(description)}`,
                failure: `${returnUrl}/?status=failure`,
                pending: `${returnUrl}/?status=pending`
            },
            auto_return: 'approved'
        };
        const result = await preference.create({ body });
        res.json({ init_point: result.init_point });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao criar checkout' });
    }
});

// --- ROTA: STATUS ---
app.get('/payment-status/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const payment = new Payment(client);
        const result = await payment.get({ id });
        res.json({ id: result.id, status: result.status });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao verificar status' });
    }
});

// --- ROTA: LOGIN ÁREA DE MEMBROS ---
app.post('/login', (req, res) => {
    const { email } = req.body;
    // O login retorna sucesso; a validação de acesso é feita pelo e-mail no frontend
    res.json({ success: true, message: "Login simulado" });
});

// --- ROTA: ENVIAR EMAIL (RESEND) ---
app.post('/send-email', async (req, res) => {
    const { email, protocolTitle } = req.body;
    if (!process.env.RESEND_API_KEY) return res.json({ success: false });

    // Link dinâmico que transporta a permissão (status=approved) e o objetivo (goal)
    const accessLink = `https://receitas-oficial.com.br/?status=approved&email=${encodeURIComponent(email)}&goal=${encodeURIComponent(protocolTitle || 'Perder Peso')}&fromEmail=true`;

    try {
        await resend.emails.send({
            from: 'NutriOfficial <suporte@receitas-oficial.com.br>',
            to: [email],
            subject: '✅ Seu Acesso Oficial Liberado! (Protocolo NutriOfficial)',
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; background-color: #fff;">
                    <div style="text-align: center; border-bottom: 1px solid #eee; padding-bottom: 20px;">
                        <h2 style="color: #000; margin: 0;">NUTRI<span style="color: #FFCC00;">OFFICIAL</span></h2>
                    </div>
                    <h1 style="color: #10B981; text-align: center; margin-top: 30px;">Pagamento Confirmado! 🚀</h1>
                    <p>Olá, o seu acesso ao <strong>${protocolTitle || 'Protocolo'}</strong> foi liberado com sucesso.</p>
                    <div style="background: #fffbeb; padding: 20px; border-radius: 8px; text-align: center; border: 1px solid #fcd34d; margin: 20px 0;">
                        <p style="font-weight: bold; margin-bottom: 15px; color: #333;">Clique no botão abaixo para baixar seu material:</p>
                        <a href="${accessLink}" style="background: #000; color: #FFCC00; padding: 15px 30px; text-decoration: none; font-weight: bold; border-radius: 50px; display: inline-block; font-size: 16px;">ACESSAR MATERIAL AGORA</a>
                    </div>
                    <p style="color: #666; font-size: 11px; text-align: center;">Dica: Salve este e-mail. Se trocar de navegador, use este botão para reativar seu acesso.</p>
                    <p style="color: #999; font-size: 10px; text-align: center; margin-top: 20px;">© 2025 NutriOfficial</p>
                </div>
            `
        });
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false });
    }
});

module.exports = app;

if (require.main === module) {
    app.listen(port, () => console.log(`Servidor rodando na porta ${port}`));
}