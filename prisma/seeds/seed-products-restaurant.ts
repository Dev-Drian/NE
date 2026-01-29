import { PrismaClient } from '@prisma/client';

export async function seedRestaurantProducts(prisma: PrismaClient, companyId: string) {
  console.log('\n📦 Creando productos del restaurante en BD...');
  
  const products = [
    // Pizzas
    { name: 'Pizza Margherita', price: 25000, category: 'pizzas', hasStock: true, stock: 25, minStock: 5, keywords: ['pizza', 'margherita', 'margarita', 'queso', 'tomate'], description: 'Pizza clásica con tomate, mozzarella y albahaca' },
    { name: 'Pizza Pepperoni', price: 28000, category: 'pizzas', hasStock: true, stock: 20, minStock: 5, keywords: ['pizza', 'pepperoni', 'salami'], description: 'Pizza con pepperoni y queso mozzarella' },
    { name: 'Pizza Cuatro Quesos', price: 30000, category: 'pizzas', hasStock: true, stock: 15, minStock: 3, keywords: ['pizza', 'quesos', 'cheese', 'cuatro'], description: 'Pizza con mozzarella, gorgonzola, parmesano y provolone' },
    { name: 'Pizza Vegetariana', price: 27000, category: 'pizzas', hasStock: true, stock: 18, minStock: 4, keywords: ['pizza', 'vegetariana', 'veggie', 'verduras'], description: 'Pizza con verduras frescas de temporada' },
    { name: 'Pizza Hawaiana', price: 29000, category: 'pizzas', hasStock: true, stock: 16, minStock: 4, keywords: ['pizza', 'hawaiana', 'piña', 'jamon'], description: 'Pizza con jamón y piña' },
    { name: 'Pizza BBQ', price: 32000, category: 'pizzas', hasStock: true, stock: 12, minStock: 3, keywords: ['pizza', 'bbq', 'barbacoa', 'pollo'], description: 'Pizza con pollo BBQ, cebolla y salsa barbacoa' },
    
    // Pastas
    { name: 'Pasta Carbonara', price: 22000, category: 'pastas', hasStock: true, stock: 30, minStock: 8, keywords: ['pasta', 'carbonara', 'crema', 'tocino'], description: 'Pasta con salsa carbonara, tocino y parmesano' },
    { name: 'Pasta Bolognesa', price: 20000, category: 'pastas', hasStock: true, stock: 35, minStock: 10, keywords: ['pasta', 'bolognesa', 'boloñesa', 'carne'], description: 'Pasta con salsa bolognesa de carne' },
    { name: 'Pasta Alfredo', price: 24000, category: 'pastas', hasStock: true, stock: 25, minStock: 7, keywords: ['pasta', 'alfredo', 'crema', 'queso'], description: 'Pasta con salsa alfredo cremosa' },
    { name: 'Lasagna', price: 26000, category: 'pastas', hasStock: true, stock: 20, minStock: 5, keywords: ['lasagna', 'lasaña', 'carne', 'queso'], description: 'Lasagna tradicional con carne y queso' },
    { name: 'Ravioles', price: 28000, category: 'pastas', hasStock: true, stock: 15, minStock: 4, keywords: ['ravioles', 'ravioli', 'rellenos'], description: 'Ravioles rellenos con ricotta y espinaca' },
    { name: 'Fetuccini', price: 23000, category: 'pastas', hasStock: true, stock: 22, minStock: 6, keywords: ['fetuccini', 'fettuccine', 'alfredo'], description: 'Fetuccini con salsa de tu elección' },
    
    // Entradas
    { name: 'Bruschetta', price: 12000, category: 'entradas', hasStock: true, stock: 40, minStock: 10, keywords: ['bruschetta', 'entrada', 'aperitivo', 'pan', 'tomate'], description: 'Pan tostado con tomate fresco y albahaca' },
    { name: 'Ensalada Caprese', price: 15000, category: 'entradas', hasStock: true, stock: 30, minStock: 8, keywords: ['ensalada', 'caprese', 'tomate', 'mozzarella'], description: 'Ensalada con tomate, mozzarella y albahaca' },
    { name: 'Sopa del día', price: 10000, category: 'entradas', hasStock: true, stock: 25, minStock: 5, keywords: ['sopa', 'entrada', 'caliente'], description: 'Sopa casera del día' },
    { name: 'Carpaccio', price: 22000, category: 'entradas', hasStock: true, stock: 15, minStock: 4, keywords: ['carpaccio', 'carne', 'res', 'crudo'], description: 'Finas láminas de res con parmesano y rúgula' },
    
    // Bebidas
    { name: 'Coca Cola', price: 3000, category: 'bebidas', hasStock: true, stock: 100, minStock: 20, keywords: ['coca', 'cola', 'gaseosa', 'refresco', 'soda'], description: 'Coca Cola 350ml' },
    { name: 'Agua', price: 2000, category: 'bebidas', hasStock: true, stock: 80, minStock: 15, keywords: ['agua', 'water', 'mineral'], description: 'Agua mineral 500ml' },
    { name: 'Vino Tinto', price: 45000, category: 'bebidas', hasStock: true, stock: 30, minStock: 5, keywords: ['vino', 'tinto', 'red wine', 'copa'], description: 'Vino tinto de la casa' },
    { name: 'Vino Blanco', price: 42000, category: 'bebidas', hasStock: true, stock: 25, minStock: 5, keywords: ['vino', 'blanco', 'white wine', 'copa'], description: 'Vino blanco de la casa' },
    { name: 'Limonada', price: 5000, category: 'bebidas', hasStock: true, stock: 50, minStock: 10, keywords: ['limonada', 'lemonade', 'limon', 'natural'], description: 'Limonada natural' },
    { name: 'Jugo Natural', price: 6000, category: 'bebidas', hasStock: true, stock: 40, minStock: 8, keywords: ['jugo', 'juice', 'natural', 'fruta'], description: 'Jugo natural de frutas' },
    
    // Postres
    { name: 'Tiramisu', price: 12000, category: 'postres', hasStock: true, stock: 20, minStock: 4, keywords: ['tiramisu', 'postre', 'dessert', 'cafe'], description: 'Tiramisú italiano tradicional' },
    { name: 'Panna Cotta', price: 10000, category: 'postres', hasStock: true, stock: 25, minStock: 5, keywords: ['panna', 'cotta', 'postre', 'crema'], description: 'Panna cotta con salsa de frutos rojos' },
    { name: 'Cannoli', price: 8000, category: 'postres', hasStock: true, stock: 30, minStock: 6, keywords: ['cannoli', 'postre', 'siciliano'], description: 'Cannoli siciliano relleno de ricotta' },
    { name: 'Gelato', price: 7000, category: 'postres', hasStock: true, stock: 50, minStock: 10, keywords: ['gelato', 'helado', 'ice cream', 'italiano'], description: 'Gelato italiano artesanal' },
  ];

  const createdProducts = [];
  for (const product of products) {
    const created = await prisma.product.create({
      data: {
        companyId,
        ...product,
        available: true,
        active: true,
      },
    });
    createdProducts.push(created);
  }
  
  console.log(`✅ ${createdProducts.length} productos del restaurante creados en BD`);
  return createdProducts;
}
