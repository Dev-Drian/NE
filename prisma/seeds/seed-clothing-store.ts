import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Seed de productos para la Tienda de Ropa
 * Catálogo de prendas de vestir
 */
export async function seedClothingStoreProducts(prisma: PrismaClient, companyId: string) {
  console.log('👗 Creando productos de la tienda de ropa...');

  const products: Prisma.ProductCreateInput[] = [
    // === CAMISAS ===
    {
      company: { connect: { id: companyId } },
      name: 'Camisa Formal Slim Fit',
      description: 'Camisa de algodón para ocasiones formales, corte slim',
      category: 'camisas',
      price: 89000,
      available: true,
      hasStock: true,
      stock: 25,
      minStock: 5,
      keywords: ['camisa', 'formal', 'slim', 'algodon', 'elegante'],
      metadata: { tallas: ['S', 'M', 'L', 'XL', 'XXL'], colores: ['blanco', 'azul claro', 'negro', 'gris'] },
    },
    {
      company: { connect: { id: companyId } },
      name: 'Camisa Casual Estampada',
      description: 'Camisa manga corta con estampados modernos',
      category: 'camisas',
      price: 75000,
      available: true,
      hasStock: true,
      stock: 30,
      minStock: 5,
      keywords: ['camisa', 'casual', 'estampada', 'manga corta'],
      metadata: { tallas: ['S', 'M', 'L', 'XL'], colores: ['flores', 'rayas', 'tropical', 'abstracto'] },
    },
    {
      company: { connect: { id: companyId } },
      name: 'Polo Clásico',
      description: 'Polo de algodón piqué con cuello y botones',
      category: 'camisas',
      price: 65000,
      available: true,
      hasStock: true,
      stock: 40,
      minStock: 8,
      keywords: ['polo', 'casual', 'algodon', 'clasico'],
      metadata: { tallas: ['S', 'M', 'L', 'XL', 'XXL'], colores: ['blanco', 'negro', 'azul marino', 'rojo', 'verde'] },
    },

    // === PANTALONES ===
    {
      company: { connect: { id: companyId } },
      name: 'Jean Skinny Stretch',
      description: 'Jean ajustado con elastano para mayor comodidad',
      category: 'pantalones',
      price: 120000,
      available: true,
      hasStock: true,
      stock: 35,
      minStock: 7,
      keywords: ['jean', 'pantalon', 'skinny', 'stretch', 'ajustado'],
      metadata: { tallas: ['28', '30', '32', '34', '36', '38'], colores: ['azul oscuro', 'azul claro', 'negro', 'gris'] },
    },
    {
      company: { connect: { id: companyId } },
      name: 'Pantalón Formal de Vestir',
      description: 'Pantalón de tela para oficina o eventos formales',
      category: 'pantalones',
      price: 135000,
      available: true,
      hasStock: true,
      stock: 20,
      minStock: 5,
      keywords: ['pantalon', 'formal', 'vestir', 'elegante', 'oficina'],
      metadata: { tallas: ['28', '30', '32', '34', '36', '38'], colores: ['negro', 'gris oscuro', 'azul marino', 'beige'] },
    },
    {
      company: { connect: { id: companyId } },
      name: 'Jogger Deportivo',
      description: 'Pantalón jogger cómodo para el día a día',
      category: 'pantalones',
      price: 85000,
      available: true,
      hasStock: true,
      stock: 25,
      minStock: 5,
      keywords: ['jogger', 'deportivo', 'comodo', 'casual'],
      metadata: { tallas: ['S', 'M', 'L', 'XL'], colores: ['negro', 'gris', 'azul marino', 'verde militar'] },
    },

    // === VESTIDOS ===
    {
      company: { connect: { id: companyId } },
      name: 'Vestido Coctel Elegante',
      description: 'Vestido corto para fiestas y eventos especiales',
      category: 'vestidos',
      price: 180000,
      available: true,
      hasStock: true,
      stock: 15,
      minStock: 3,
      keywords: ['vestido', 'coctel', 'fiesta', 'elegante', 'corto'],
      metadata: { tallas: ['XS', 'S', 'M', 'L', 'XL'], colores: ['negro', 'rojo', 'azul', 'dorado', 'plateado'] },
    },
    {
      company: { connect: { id: companyId } },
      name: 'Vestido Casual de Verano',
      description: 'Vestido fresco y cómodo para el día a día',
      category: 'vestidos',
      price: 95000,
      available: true,
      hasStock: true,
      stock: 20,
      minStock: 4,
      keywords: ['vestido', 'casual', 'verano', 'fresco', 'comodo'],
      metadata: { tallas: ['XS', 'S', 'M', 'L'], colores: ['floral', 'blanco', 'coral', 'amarillo', 'verde menta'] },
    },
    {
      company: { connect: { id: companyId } },
      name: 'Vestido Largo de Gala',
      description: 'Vestido largo para ocasiones muy especiales',
      category: 'vestidos',
      price: 350000,
      available: true,
      hasStock: true,
      stock: 8,
      minStock: 2,
      keywords: ['vestido', 'largo', 'gala', 'matrimonio', 'especial'],
      metadata: { tallas: ['XS', 'S', 'M', 'L'], colores: ['negro', 'burgundy', 'azul noche', 'esmeralda'] },
    },

    // === BLUSAS ===
    {
      company: { connect: { id: companyId } },
      name: 'Blusa de Seda',
      description: 'Blusa elegante de seda para oficina o eventos',
      category: 'blusas',
      price: 125000,
      available: true,
      hasStock: true,
      stock: 18,
      minStock: 4,
      keywords: ['blusa', 'seda', 'elegante', 'oficina'],
      metadata: { tallas: ['XS', 'S', 'M', 'L', 'XL'], colores: ['blanco', 'negro', 'nude', 'azul pálido', 'rosa'] },
    },
    {
      company: { connect: { id: companyId } },
      name: 'Top Crop Casual',
      description: 'Top corto moderno para combinar con jeans',
      category: 'blusas',
      price: 55000,
      available: true,
      hasStock: true,
      stock: 30,
      minStock: 6,
      keywords: ['top', 'crop', 'casual', 'moderno'],
      metadata: { tallas: ['XS', 'S', 'M', 'L'], colores: ['negro', 'blanco', 'amarillo', 'lila', 'verde'] },
    },

    // === CHAQUETAS ===
    {
      company: { connect: { id: companyId } },
      name: 'Blazer Estructurado',
      description: 'Blazer formal para oficina, disponible en varios colores',
      category: 'chaquetas',
      price: 220000,
      available: true,
      hasStock: true,
      stock: 12,
      minStock: 3,
      keywords: ['blazer', 'chaqueta', 'formal', 'oficina', 'elegante'],
      metadata: { tallas: ['S', 'M', 'L', 'XL'], colores: ['negro', 'azul marino', 'gris', 'beige'] },
    },
    {
      company: { connect: { id: companyId } },
      name: 'Chaqueta de Cuero',
      description: 'Chaqueta de cuero sintético estilo biker',
      category: 'chaquetas',
      price: 280000,
      available: true,
      hasStock: true,
      stock: 10,
      minStock: 2,
      keywords: ['chaqueta', 'cuero', 'biker', 'rock'],
      metadata: { tallas: ['S', 'M', 'L', 'XL'], colores: ['negro', 'marrón', 'burgundy'] },
    },
    {
      company: { connect: { id: companyId } },
      name: 'Sudadera con Capucha',
      description: 'Sudadera cómoda con capucha y bolsillos',
      category: 'chaquetas',
      price: 95000,
      available: true,
      hasStock: true,
      stock: 25,
      minStock: 5,
      keywords: ['sudadera', 'hoodie', 'capucha', 'casual', 'comoda'],
      metadata: { tallas: ['S', 'M', 'L', 'XL', 'XXL'], colores: ['negro', 'gris', 'blanco', 'azul', 'rosa'] },
    },

    // === ACCESORIOS ===
    {
      company: { connect: { id: companyId } },
      name: 'Cinturón de Cuero',
      description: 'Cinturón clásico de cuero con hebilla metálica',
      category: 'accesorios',
      price: 65000,
      available: true,
      hasStock: true,
      stock: 30,
      minStock: 6,
      keywords: ['cinturon', 'cuero', 'accesorio', 'clasico'],
      metadata: { tallas: ['S', 'M', 'L', 'XL'], colores: ['negro', 'marrón', 'café'] },
    },
    {
      company: { connect: { id: companyId } },
      name: 'Bufanda de Lana',
      description: 'Bufanda suave y cálida para el frío',
      category: 'accesorios',
      price: 45000,
      available: true,
      hasStock: true,
      stock: 20,
      minStock: 4,
      keywords: ['bufanda', 'lana', 'frio', 'caliente'],
      metadata: { colores: ['gris', 'beige', 'negro', 'rojo', 'azul'] },
    },
    {
      company: { connect: { id: companyId } },
      name: 'Bolso Tote Grande',
      description: 'Bolso amplio para el día a día',
      category: 'accesorios',
      price: 150000,
      available: true,
      hasStock: true,
      stock: 15,
      minStock: 3,
      keywords: ['bolso', 'tote', 'cartera', 'grande'],
      metadata: { colores: ['negro', 'café', 'nude', 'blanco'] },
    },

    // === ZAPATOS ===
    {
      company: { connect: { id: companyId } },
      name: 'Tacones Stiletto',
      description: 'Zapatos de tacón alto elegantes',
      category: 'zapatos',
      price: 180000,
      available: true,
      hasStock: true,
      stock: 15,
      minStock: 3,
      keywords: ['tacones', 'stiletto', 'zapatos', 'elegante', 'fiesta'],
      metadata: { tallas: ['35', '36', '37', '38', '39', '40'], colores: ['negro', 'nude', 'rojo', 'dorado'] },
    },
    {
      company: { connect: { id: companyId } },
      name: 'Zapatillas Urbanas',
      description: 'Zapatillas cómodas para el día a día',
      category: 'zapatos',
      price: 140000,
      available: true,
      hasStock: true,
      stock: 20,
      minStock: 4,
      keywords: ['zapatillas', 'tenis', 'sneakers', 'casual', 'comodas'],
      metadata: { tallas: ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44'], colores: ['blanco', 'negro', 'gris', 'multicolor'] },
    },
    {
      company: { connect: { id: companyId } },
      name: 'Sandalias de Verano',
      description: 'Sandalias cómodas y frescas',
      category: 'zapatos',
      price: 75000,
      available: true,
      hasStock: true,
      stock: 25,
      minStock: 5,
      keywords: ['sandalias', 'verano', 'playa', 'frescas'],
      metadata: { tallas: ['35', '36', '37', '38', '39', '40'], colores: ['negro', 'café', 'blanco', 'dorado'] },
    },
  ];

  for (const productData of products) {
    await prisma.product.create({ data: productData });
    console.log(`   ✅ Producto: ${productData.name}`);
  }

  console.log(`✅ ${products.length} productos de la tienda de ropa creados`);
}

/**
 * Recursos para la tienda de ropa: estilistas y probadores
 */
export async function seedClothingStoreResources(prisma: PrismaClient, companyId: string) {
  console.log('👗 Creando recursos de la tienda de ropa...');

  const resources = [
    {
      companyId,
      name: 'María García - Estilista Senior',
      type: 'estilista',
      capacity: 1,
      metadata: {
        description: 'Estilista con 10 años de experiencia en moda femenina',
        especialidad: ['moda femenina', 'eventos', 'casual elegante'],
        idiomas: ['español', 'inglés'],
        experiencia_años: 10,
        certificaciones: ['Image Consultant', 'Personal Stylist'],
      },
      active: true,
    },
    {
      companyId,
      name: 'Carlos Mendoza - Asesor de Moda',
      type: 'estilista',
      capacity: 1,
      metadata: {
        description: 'Especialista en moda masculina y casual',
        especialidad: ['moda masculina', 'casual', 'ejecutivo'],
        idiomas: ['español'],
        experiencia_años: 5,
      },
      active: true,
    },
    {
      companyId,
      name: 'Probador VIP',
      type: 'probador',
      capacity: 2,
      metadata: {
        description: 'Probador amplio con espejo de cuerpo completo e iluminación especial',
        tipo: 'vip',
        espejos: 3,
        iluminacion_especial: true,
        area_m2: 8,
      },
      active: true,
    },
  ];

  for (const resource of resources) {
    await prisma.resource.create({ data: resource });
    console.log(`   ✅ Recurso: ${resource.name}`);
  }

  console.log(`✅ ${resources.length} recursos de la tienda de ropa creados`);
}
