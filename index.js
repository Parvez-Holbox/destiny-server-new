require("dotenv").config({ path: "./.env" });
const express = require("express");
const app = express();
const cors = require('cors');
const bodyParser = require('body-parser')
const { queryToFetchAvailableProducts, queryToFetchSingleProduct } = require('./graphql-queries');

app.use(cors());
app.use(bodyParser.json());
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2022-08-01",
});

const GRAPHQL_STOREFRONT_API = `https://${process.env.SHOPIFY_DOMAIN}/api/2023-10/graphql.json`;
const GRAPHQL_ADMIN_API = `https://${process.env.SHOPIFY_DOMAIN}/admin/api/2023-10/orders.json`;

console.log(GRAPHQL_STOREFRONT_API);
console.log(GRAPHQL_ADMIN_API);
console.log(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN);


app.post('/create-payment-intent', async (req, res) => {

    try {

        const { amount, currency, variantId, productTitles, quantity } = req.body;
        const amountInCents = Math.round(amount * 100); 
        // Create a PaymentIntent with the specified amount and currency
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInCents, // Amount in cents (e.g., $10.00 is 1000 cents)
            currency: currency, // e.g., 'usd'
            payment_method_types: ['card'], // Specify accepted payment methods
            metadata: {
                variant_id: variantId,
                productTitles: productTitles,
                quantity: quantity.toString(), // Stripe metadata requires values to be strings
            },
        });
        console.log(paymentIntent);
        
        // Send the client_secret to the client
        res.json({ clientSecret: paymentIntent.client_secret });

    } catch (error) {

        console.error('Error creating PaymentIntent:', error);
        res.status(500).json({ error: 'Failed to create PaymentIntent' });

    }

});

app.post("/create-shopify-order", async (req, res) => {
   
    const { variant_id,quantity, customerEmail, customerName, shippingAddress, billingAddress } = req.body;

    // Construct the Shopify order payload
    const shopifyOrderData = {
        order: {
            line_items: [
                {
                    variant_id: variant_id,
                    quantity: quantity,
                },
            ],
            inventory_behaviour: "decrement_obeying_policy",
            customer: {
                first_name: customerName.split(" ")[0],
                last_name: customerName.split(" ")[1] || "",
                email: customerEmail,
            },
            shipping_address: {
                first_name: customerName.split(" ")[0],
                last_name: customerName.split(" ")[1] || "",
                address1: shippingAddress.addressLine[0],
                address2: shippingAddress.addressLine[1] || "",
                city: shippingAddress.city,
                province: shippingAddress.region,
                country: shippingAddress.country,
                zip: shippingAddress.postalCode,
            },
            billing_address: {
                first_name: customerName.split(" ")[0],
                last_name: customerName.split(" ")[1] || "",
                address1: billingAddress.addressLine[0],
                address2: billingAddress.addressLine[1] || "",
                city: billingAddress.city,
                province: billingAddress.region,
                country: billingAddress.country,
                zip: billingAddress.postalCode,
            },
            financial_status: "paid",
        },
    };

    try {

        const options = {

            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
            },
            body: JSON.stringify(shopifyOrderData)

        }

        const response = await fetch(GRAPHQL_ADMIN_API, options);

        if (!response.ok) {

            throw new Error(`Shopify order creation failed with status ${response.status}`);

        }

        const orderData = await response.json();

        res.status(200).json({
            message: "Shopify order created successfully",
            orderId: orderData.order.id,
            order: orderData.order,
        });

    } catch (error) {

        console.error("Error creating Shopify order:", error);
        res.status(500).json({ error: "Failed to create Shopify order" });

    }

});

app.post('/calculateShipping', (req, res) => {

    const { shippingAddress } = req.body;

    // Check if the country is supported
    if (shippingAddress.country !== 'US') {
        return res.status(400).json({ status: 'invalid_shipping_address' });
    }

    // Define example shipping options
    const shippingOptions = [
        {
            id: 'standard',
            label: 'Standard Shipping (5-7 business days)',
            amount: 500,  // Amount in cents
            description: 'Standard shipping rate'
        },
        {
            id: 'express',
            label: 'Express Shipping (2-3 business days)',
            amount: 1000, // Amount in cents
            description: 'Express shipping rate'
        }
    ];

    // Send the supported shipping options back to the client
    res.json({ supportedShippingOptions: shippingOptions });

});

// Endpoint to fetch specific product details
app.get('/api/products/:id', async (req, res) => {

    const productId = req.params.id;

    const query = queryToFetchSingleProduct(productId);

    try {

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Storefront-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
            },
            body: JSON.stringify({ query }),
        }

        const response = await fetch(GRAPHQL_STOREFRONT_API, options);

        console.log(`Fetching product from: ${GRAPHQL_STOREFRONT_API}`);

        if (!response.ok) {

            throw new Error('Network response was not ok');

        }

        const data = await response.json();
        const originalData = data.data;

        const formattedData = {
            product: {
                id: originalData.product.id,
                variant_id: originalData.product.variants.edges[0].node.id,
                title: originalData.product.title,
                description: originalData.product.description,
                images: originalData.product.images.edges.map(edge => edge.node.src),
                price: originalData.product.variants.edges[0].node.priceV2.amount,
                currency: originalData.product.variants.edges[0].node.priceV2.currencyCode
            }
        };

        res.json({ ...formattedData });  // Adjusting the response format to match what the client expects

    } catch (error) {

        console.error('Error fetching product:', error);
        res.status(500).send('Error fetching product');

    }

});

// Endpoint to fetch all the product details
app.get('/api/products', async (req, res) => {

    const query = queryToFetchAvailableProducts();

    try {

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Storefront-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
            },
            body: JSON.stringify({ query }),
        }

        const response = await fetch(GRAPHQL_STOREFRONT_API, options);

        console.log(`Fetching products from: ${GRAPHQL_STOREFRONT_API}`);

        if (!response.ok) {

            throw new Error('Network response was not ok');

        }

        const data = await response.json();

        const products = data.data.products.edges.map(edge => ({
            id: edge.node.id,
            title: edge.node.title,
            available: edge.node.availableForSale
        })).filter(x => x.available);

        const pageInfo = data.data.products.pageInfo;

        // console.log(data.data.products.edges[0].node.variants.edges[0].node)

        // Respond with the data, focusing on products and pagination info if needed
        res.json({ products, pageInfo });

    } catch (error) {

        console.error('Error fetching products:', error);
        res.status(500).send('Error fetching products');

    }

});

// Listening on port 8000
app.listen(8000, () =>
    console.log(`Node server listening at ${process.env.ENV === 'dev' ? process.env.DEV_URL : process.env.PROD_URL}`)
);