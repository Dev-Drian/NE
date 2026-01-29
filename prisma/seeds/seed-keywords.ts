import { PrismaClient } from '@prisma/client';

export async function seedServiceKeywords(prisma: PrismaClient, companyId?: string) {
  console.log('\n🔑 Creando keywords de servicios...');
  
  // Keywords GLOBALES (aplican a todas las empresas)
  const globalKeywords = [
    // Keywords para DOMICILIO/DELIVERY
    { keyword: 'domicilio', serviceKey: 'domicilio', type: 'contains', weight: 1.0 },
    { keyword: 'delivery', serviceKey: 'domicilio', type: 'contains', weight: 1.0 },
    { keyword: 'a domicilio', serviceKey: 'domicilio', type: 'contains', weight: 1.0 },
    { keyword: 'pedir a domicilio', serviceKey: 'domicilio', type: 'contains', weight: 0.95 },
    { keyword: 'envío', serviceKey: 'domicilio', type: 'contains', weight: 0.9 },
    { keyword: 'envio', serviceKey: 'domicilio', type: 'contains', weight: 0.9 },
    { keyword: 'llevar a casa', serviceKey: 'domicilio', type: 'contains', weight: 0.9 },
    { keyword: 'entrega', serviceKey: 'domicilio', type: 'contains', weight: 0.85 },
    { keyword: 'pedir para llevar', serviceKey: 'domicilio', type: 'contains', weight: 0.9 },
    { keyword: 'orden a domicilio', serviceKey: 'domicilio', type: 'contains', weight: 0.95 },
    
    // Keywords para MESA/RESTAURANTE
    { keyword: 'mesa', serviceKey: 'mesa', type: 'contains', weight: 1.0 },
    { keyword: 'reservar mesa', serviceKey: 'mesa', type: 'contains', weight: 0.95 },
    { keyword: 'reserva de mesa', serviceKey: 'mesa', type: 'contains', weight: 0.95 },
    { keyword: 'comer en el restaurante', serviceKey: 'mesa', type: 'contains', weight: 0.9 },
    { keyword: 'ir al restaurante', serviceKey: 'mesa', type: 'contains', weight: 0.85 },
    { keyword: 'cenar', serviceKey: 'mesa', type: 'contains', weight: 0.8 },
    { keyword: 'almorzar', serviceKey: 'mesa', type: 'contains', weight: 0.8 },
    
    // Keywords para CITA/CLÍNICA
    { keyword: 'cita', serviceKey: 'cita', type: 'contains', weight: 1.0 },
    { keyword: 'consulta', serviceKey: 'cita', type: 'contains', weight: 0.95 },
    { keyword: 'turno', serviceKey: 'cita', type: 'contains', weight: 0.95 },
    { keyword: 'agendar cita', serviceKey: 'cita', type: 'contains', weight: 0.98 },
    { keyword: 'pedir cita', serviceKey: 'cita', type: 'contains', weight: 0.98 },
    { keyword: 'sacar cita', serviceKey: 'cita', type: 'contains', weight: 0.98 },
    { keyword: 'reservar cita', serviceKey: 'cita', type: 'contains', weight: 0.95 },
    { keyword: 'cita médica', serviceKey: 'cita', type: 'contains', weight: 0.95 },
    { keyword: 'cita dental', serviceKey: 'cita', type: 'contains', weight: 0.95 },
    { keyword: 'dentista', serviceKey: 'cita', type: 'contains', weight: 0.9 },
    { keyword: 'doctor', serviceKey: 'cita', type: 'contains', weight: 0.85 },
    { keyword: 'odontólogo', serviceKey: 'cita', type: 'contains', weight: 0.9 },
    { keyword: 'odontologo', serviceKey: 'cita', type: 'contains', weight: 0.9 },
  ];

  const createdGlobal = [];
  for (const kw of globalKeywords) {
    const created = await prisma.serviceKeyword.create({
      data: {
        companyId: null, // null = global
        ...kw,
        language: 'es',
        active: true,
      },
    });
    createdGlobal.push(created);
  }
  
  console.log(`✅ ${createdGlobal.length} keywords globales creados`);

  // Keywords ESPECÍFICOS (si se proporciona companyId)
  if (companyId) {
    const specificKeywords = [
      // Ejemplo: keyword específico para una empresa
      { keyword: 'la pasta', serviceKey: 'mesa', type: 'contains', weight: 0.7 },
    ];

    const createdSpecific = [];
    for (const kw of specificKeywords) {
      const created = await prisma.serviceKeyword.create({
        data: {
          companyId,
          ...kw,
          language: 'es',
          active: true,
        },
      });
      createdSpecific.push(created);
    }
    
    console.log(`✅ ${createdSpecific.length} keywords específicos creados`);
    
    return { global: createdGlobal, specific: createdSpecific };
  }

  return { global: createdGlobal, specific: [] };
}
