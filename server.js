const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment, Preference } = require('mercadopago');
const { Resend } = require('resend');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Configurações do Mercado Pago
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MP_ACCESS_TOKEN 
});

// Configura Resend (E-mail) com proteção para não derrubar o servidor na falta da chave
const resend = new Resend(process.env.RESEND_API_KEY || 're_123_placeholder');

app.use(express.json());

// Configuração manual de CORS para evitar bloqueios na Vercel
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === 'OPTIONS') return res.status(200).end();
    next();
});

// Função para gerar CPF válido para o Pix (Evita rejeição bancária)
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

// --- ROTA 1: CRIAR PAGAMENTO PIX ---
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
            qr_code_base64: result.point_of_interaction.transaction_data.qr_code_base64,
            ticket_url: result.point_of_interaction.transaction_data.ticket_url
        });
    } catch (error) {
        console.error("Erro Pix:", error);
        res.status(500).json({ error: 'Erro ao gerar Pix', details: error.message });
    }
});

// --- ROTA 2: CRIAR CHECKOUT DE CARTÃO ---
app.post('/create-preference', async (req, res) => {
    try {
        const { amount, description, returnUrl, email } = req.body;
        const preference = new Preference(client);

        const body = {
            items: [{ 
                title: description || 'Protocolo Digital Nutri', 
                quantity: 1, 
                unit_price: Number(amount) 
            }],
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
        console.error("Erro Cartão:", error);
        res.status(500).json({ error: 'Erro ao criar checkout', details: error.message });
    }
});

// --- ROTA 3: CONSULTAR STATUS DO PAGAMENTO ---
app.get('/payment-status/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const payment = new Payment(client);
        const result = await payment.get({ id });
        res.json({ id: result.id, status: result.status });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao consultar status' });
    }
});

// --- ROTA 4: ENVIO DE E-MAIL (RESEND) ---
app.post('/send-email', async (req, res) => {
    const { email, protocolTitle } = req.body;
    
    // Verifica se a chave existe antes de tentar enviar
    if (!process.env.RESEND_API_KEY) {
        return res.status(500).json({ success: false, error: "Chave Resend não configurada" });
    }

    // Link de acesso dinâmico para evitar perda de dados entre navegadores (Instagram/Facebook Ads)
    const accessLink = `https://receitas-oficial.com.br/?status=approved&email=${encodeURIComponent(email)}&goal=${encodeURIComponent(protocolTitle || 'Perder Peso')}`;

    try {
        await resend.emails.send({
            from: 'NutriOfficial <suporte@receitas-oficial.com.br>',
            to: [email],
            subject: '✅ Seu Acesso Oficial Liberado! (Protocolo NutriOfficial)',
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #eee; border-radius: 15px; background-color: #ffffff;">
                    <div style="text-align: center; border-bottom: 1px solid #eee; padding-bottom: 20px;">
                        <h2 style="color: #000; margin: 0;">NUTRI<span style="color: #FFCC00;">OFFICIAL</span></h2>
                    </div>
                    
                    <h1 style="color: #10B981; text-align: center; margin-top: 30px;">Pagamento Confirmado! 🚀</h1>
                    
                    <p style="font-size: 16px; color: #555; line-height: 1.6;">Olá,</p>
                    <p style="font-size: 16px; color: #555; line-height: 1.6;">Seu pagamento foi confirmado e o seu <strong>${protocolTitle || 'Protocolo'}</strong> já está liberado para download.</p>
                    <p style="font-size: 16px; color: #555; line-height: 1.6;">Este e-mail serve como seu comprovante de acesso vitalício. Mesmo que mude de telemóvel ou navegador, utilize o botão abaixo para entrar.</p>
                    
                    <div style="background-color: #fffbeb; padding: 25px; border-radius: 10px; text-align: center; margin: 30px 0; border: 1px solid #fcd34d;">
                        <p style="font-weight: bold; margin-bottom: 20px; color: #333;">Para baixar seu protocolo, clique no botão abaixo:</p>
                        <a href="${accessLink}" style="background-color: #000; color: #FFCC00; padding: 15px 30px; text-decoration: none; font-weight: bold; border-radius: 50px; display: inline-block; font-size: 16px;">ACESSAR MATERIAL AGORA</a>
                    </div>
                    
                    <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">© 2025 NutriOfficial - Todos os direitos reservados.</p>
                </div>
            `
        });
        res.json({ success: true });
    } catch (error) {
        console.error("Erro no envio do Resend:", error);
        res.json({ success: false, error: error.message });
    }
});

module.exports = app;

if (require.main === module) {
    app.listen(port, () => console.log(`Servidor rodando na porta ${port}`));
}