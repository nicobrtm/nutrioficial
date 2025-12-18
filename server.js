const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago');
require('dotenv').config();

const app = express();

// Na Vercel a porta é automática, mas mantemos 3000 para testes locais
const port = process.env.PORT || 3000;

// Configura o Mercado Pago
// A chave será pega das Variáveis de Ambiente da Vercel
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MP_ACCESS_TOKEN 
});

app.use(express.json());
app.use(cors());

// Rota de Teste
app.get('/', (req, res) => {
    res.send('API NutriOfficial Online 🚀');
});

// Rota 1: Criar o Pix
app.post('/create-payment', async (req, res) => {
    try {
        const { email, amount, description } = req.body;
        const payment = new Payment(client);

        const body = {
            transaction_amount: Number(amount),
            description: description || 'NutriOfficial',
            payment_method_id: 'pix',
            payer: { email: email || 'cliente@email.com' },
            date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 min validade
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
        console.error(error);
        res.status(500).json({ error: 'Erro ao gerar Pix' });
    }
});

// Rota 2: Verificar Status
app.get('/payment-status/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const payment = new Payment(client);
        const result = await payment.get({ id });

        res.json({
            id: result.id,
            status: result.status,
            status_detail: result.status_detail
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao consultar status' });
    }
});

// Exporta o app para a Vercel (Obrigatório)
module.exports = app;

// Só roda o listen se estiver no seu PC (local)
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Servidor rodando na porta ${port}`);
    });
}