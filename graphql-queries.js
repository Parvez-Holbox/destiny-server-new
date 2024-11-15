
// Construct the GraphQL query to fetch a specific product
const queryToFetchSingleProduct = (productId) => {

    return `
        {
            product(id: "gid://shopify/Product/${productId}") {

                id
                title
                description
                
                variants(first: 5) {
                    edges {
                        node {
                            id
                            priceV2 {
                                amount
                                currencyCode
                            }
                        }
                    }
                }

                images(first: 10) {
                    edges {
                        node {
                            src
                        }
                    }
                }

            }
        }
    `;

}

// Construct the GraphQL query to fetch products
const queryToFetchAvailableProducts = () => {

    return `
        {
            products(first: 100) {

                edges {
                    node {
                        id
                        title
                        availableForSale
                        variants(first: 100) {
                            edges {
                                node {
                                    id
                                    availableForSale
                                }
                            }
                        }
                    }
                }
                
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
        }
    `;

}

module.exports = { queryToFetchAvailableProducts, queryToFetchSingleProduct };