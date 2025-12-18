const express = require('express');
const cors = require('cors');
// Importa Preference além de Payment
const { MercadoPagoConfig, Payment, Preference } = require('mercadopago');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Configura o Mercado Pago
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MP_ACCESS_TOKEN 
});

app.use(express.json());
app.use(cors());

app.get('/', (req, res) => {
    res.send('API NutriOfficial Online 🚀');
});

// Rota 1: Criar Pix (Direto na tela)
app.post('/create-payment', async (req, res) => {
    try {
        const { email, amount, description } = req.body;
        const payment = new Payment(client);

        const body = {
            transaction_amount: Number(amount),
            description: description || 'NutriOfficial',
            payment_method_id: 'pix',
            payer: { email: email || 'cliente@email.com' },
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
        console.error(error);
        res.status(500).json({ error: 'Erro ao gerar Pix' });
    }
});

// Rota 2: Criar Preferência (Para Cartão de Crédito/Débito)
app.post('/create-preference', async (req, res) => {
    try {
        const { amount, description, returnUrl } = req.body;
        const preference = new Preference(client);

        const body = {
            items: [
                {
                    id: 'protocolo-30-dias',
                    title: description || 'Protocolo NutriOfficial',
                    quantity: 1,
                    unit_price: Number(amount)
                }
            ],
            // Configura para onde o cliente volta após pagar
            back_urls: {
                success: `${returnUrl}/?status=approved`,
                failure: `${returnUrl}/?status=failure`,
                pending: `${returnUrl}/?status=pending`
            },
            auto_return: 'approved'
        };

        const result = await preference.create({ body });
        
        // Retorna o link de pagamento (init_point)
        res.json({ init_point: result.init_point });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao criar preferência de cartão' });
    }
});

// Rota 3: Verificar Status
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

module.exports = app;

if (require.main === module) {
    app.listen(port, () => {
        console.log(`Servidor rodando na porta ${port}`);
    });
}