const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment, Preference } = require('mercadopago');
const { Resend } = require('resend');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Configura Mercado Pago
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MP_ACCESS_TOKEN 
});

// Configura Resend (E-mail Profissional)
// A chave RESEND_API_KEY deve estar nas Variáveis de Ambiente da Vercel
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(express.json());
app.use(cors());

// Rota de Teste
app.get('/', (req, res) => {
    res.send('API NutriOfficial com Resend Online 🚀');
});

// --- ROTA 1: CRIAR PIX ---
app.post('/create-payment', async (req, res) => {
    try {
        const { email, amount, description } = req.body;
        const payment = new Payment(client);

        const body = {
            transaction_amount: Number(amount),
            description: description || 'Protocolo NutriOfficial',
            payment_method_id: 'pix',
            payer: { email: email },
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
        res.status(500).json({ error: 'Erro ao gerar Pix' });
    }
});

// --- ROTA 2: CRIAR LINK DE CARTÃO (PREFERENCE) ---
app.post('/create-preference', async (req, res) => {
    try {
        const { amount, description, returnUrl, email } = req.body;
        const preference = new Preference(client);

        const body = {
            items: [
                {
                    id: 'protocolo-30-dias',
                    title: description,
                    quantity: 1,
                    unit_price: Number(amount)
                }
            ],
            payer: { email: email },
            // Retorna o cliente para o site com status e email na URL
            back_urls: {
                success: `${returnUrl}/?status=approved&email=${email}`,
                failure: `${returnUrl}/?status=failure`,
                pending: `${returnUrl}/?status=pending`
            },
            auto_return: 'approved'
        };

        const result = await preference.create({ body });
        
        res.json({ init_point: result.init_point });

    } catch (error) {
        console.error("Erro Preference:", error);
        res.status(500).json({ error: 'Erro ao criar checkout' });
    }
});

// --- ROTA 3: VERIFICAR STATUS ---
app.get('/payment-status/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const payment = new Payment(client);
        const result = await payment.get({ id });

        res.json({
            id: result.id,
            status: result.status
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao consultar status' });
    }
});

// --- ROTA 4: ENVIAR E-MAIL VIA RESEND ---
app.post('/send-email', async (req, res) => {
    const { email, protocolTitle } = req.body;

    try {
        const data = await resend.emails.send({
            // IMPORTANTE: Este domínio deve estar verificado no painel do Resend
            from: 'NutriOfficial <suporte@receitas-oficial.com.br>', 
            to: [email],
            subject: '✅ Seu Acesso Oficial Liberado! (Protocolo NutriOfficial)',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
                    <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #eee;">
                        <h2 style="color: #0F0F0F; margin: 0;">NUTRI<span style="color: #FFCC00;">OFFICIAL</span></h2>
                    </div>
                    
                    <h1 style="color: #10B981; text-align: center; margin-top: 30px;">Compra Confirmada! 🚀</h1>
                    
                    <p style="font-size: 16px; color: #555; line-height: 1.6;">Olá,</p>
                    <p style="font-size: 16px; color: #555; line-height: 1.6;">Seu pagamento foi confirmado e o seu <strong>${protocolTitle || 'Protocolo'}</strong> já está disponível.</p>
                    <p style="font-size: 16px; color: #555; line-height: 1.6;">Este e-mail garante o seu acesso vitalício caso você feche o site.</p>
                    
                    <div style="background-color: #FFFBE6; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0; border: 1px solid #FFCC00;">
                        <p style="font-weight: bold; margin-bottom: 15px; color: #333;">Baixe seu PDF agora:</p>
                        <a href="https://nutriofficial.vercel.app" style="background-color: #000; color: #FFCC00; padding: 15px 30px; text-decoration: none; font-weight: bold; border-radius: 50px; display: inline-block; font-size: 16px;">ACESSAR PROTOCOLO</a>
                    </div>
                    
                    <p style="font-size: 14px; color: #999; text-align: center; margin-top: 30px;">© 2025 NutriOfficial</p>
                </div>
            `
        });

        console.log("E-mail enviado via Resend:", data);
        res.json({ success: true, data });

    } catch (error) {
        console.error("Erro Resend:", error);
        // Retornamos sucesso false mas sem erro 500 para não quebrar o fluxo do usuário
        res.json({ success: false, error: error.message });
    }
});

// Exporta o app para a Vercel
module.exports = app;

if (require.main === module) {
    app.listen(port, () => {
        console.log(`Servidor rodando na porta ${port}`);
    });
}