import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';
let db, conn;

// Initialisation de DuckDB et chargement du fichier parquet fusionné
// Car pour github on a dû découper le fichier en 4 morceaux (data.parquet.aa, ab, ac, ad) pour respecter la limite de 100Mo par fichier
export async function initData() {
    console.log("Démarrage du moteur DuckDB...");
    
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
    const worker_url = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], {type: 'text/javascript'})
    );

    const worker = new Worker(worker_url);
    const logger = new duckdb.ConsoleLogger();
    
    db = new duckdb.AsyncDuckDB(logger, worker); 
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(worker_url);

    conn = await db.connect(); 

    console.log("Chargement et fusion des fichiers parquet");
    const arrayBuffer = await fetchAndMerge();
    
    await db.registerFileBuffer('data.parquet', new Uint8Array(arrayBuffer));

    console.log("DuckDB prêt avec data.parquet fusionné");
}

// Fonction pour récupérer les 4 morceaux du fichier parquet, les fusionner
async function fetchAndMerge() {
    const chunks = ['data.parquet.aa', 'data.parquet.ab', 'data.parquet.ac', 'data.parquet.ad'];
    const promises = chunks.map(url => fetch(url).then(res => res.arrayBuffer()));
    const buffers = await Promise.all(promises);
    const totalLength = buffers.reduce((acc, buf) => acc + buf.byteLength, 0);
    const combinedArray = new Uint8Array(totalLength);

    let offset = 0;
    for (const buf of buffers) {
        combinedArray.set(new Uint8Array(buf), offset);
        offset += buf.byteLength;
    }

    return combinedArray;
}

// Fonction pour récupérer les données agrégées par zone (département ou région) en fonction des types de prairies sélectionnés
export async function getAggregatedData(levelColumn, filterTypes = []) {
    if (!Array.isArray(filterTypes) || filterTypes.length === 0) return new Map();

    try {
        const typesList = filterTypes
            .map(t => `'${String(t).replace(/'/g, "''")}'`)
            .join(',');
        const query = `
            WITH stats_par_culture AS (
                SELECT 
                    ${levelColumn} as area_code,
                    libelle_group,
                    COUNT(*) as cnt,
                    SUM(CAST(surf_parc AS FLOAT)) as s_type,
                    SUM(CAST(alt_mean AS FLOAT) * CAST(surf_parc AS FLOAT)) / SUM(CAST(surf_parc AS FLOAT)) as a_type,
                    SUM(CAST(pente_mean AS FLOAT) * CAST(surf_parc AS FLOAT)) / SUM(CAST(surf_parc AS FLOAT)) as p_type
                FROM 'data.parquet'
                WHERE libelle_group IN (${typesList})
                GROUP BY ${levelColumn}, libelle_group
            )
            SELECT 
                area_code as code,
                SUM(cnt) as nb_parcelles,
                SUM(s_type) as surface_totale,
                -- Moyennes globales de la zone
                SUM(a_type * s_type) / SUM(s_type) as altitude,
                SUM(p_type * s_type) / SUM(s_type) as pente,
                -- Chaîne formatée pour D3 : Nom:Surface:Alt:Pente
                string_agg(libelle_group || ':' || s_type || ':' || a_type || ':' || p_type, ', ') as parcelles_details
            FROM stats_par_culture
            GROUP BY area_code`;
        const result = await conn.query(query);

        return new Map(result.toArray().map(r => [r.code, r]));
    } catch (err) {
        console.error("Erreur SQL getAggregatedData :", err);
        return new Map();
    }
}

// Fonction pour récupérer les données des parcelles d'une commune en fonction des types de prairies sélectionnés
export async function getCommunesData(deptCode, filterTypes = []) {
    if (!Array.isArray(filterTypes) || filterTypes.length === 0) 
        return new Map();

    const typesList = filterTypes
        .map(t => `'${String(t).replace(/'/g, "''")}'`)
        .join(',');

    const query = `
        WITH stats_par_culture AS (
            SELECT 
                com_parc as area_code,
                libelle_group,
                COUNT(*) as cnt,
                SUM(CAST(surf_parc AS FLOAT)) as s_type,
                SUM(CAST(alt_mean AS FLOAT) * CAST(surf_parc AS FLOAT)) / SUM(CAST(surf_parc AS FLOAT)) as a_type,
                SUM(CAST(pente_mean AS FLOAT) * CAST(surf_parc AS FLOAT)) / SUM(CAST(surf_parc AS FLOAT)) as p_type
            FROM 'data.parquet'
            WHERE libelle_group IN (${typesList}) AND dep_parc = '${deptCode}'
            GROUP BY com_parc, libelle_group
        )
        SELECT 
            area_code as code,
            SUM(cnt) as nb_parcelles,
            SUM(s_type) as surface_totale,
            SUM(a_type * s_type) / SUM(s_type) as altitude,
            SUM(p_type * s_type) / SUM(s_type) as pente,
            string_agg(libelle_group || ':' || s_type || ':' || a_type || ':' || p_type, ', ') as parcelles_details
        FROM stats_par_culture
        GROUP BY area_code`;
    
    const result = await conn.query(query);
    return new Map(result.toArray().map(r => [String(r.code).padStart(5, '0'), r]));
}

export async function getParcellesData(communeCode, filterTypes = []) {

    if (!Array.isArray(filterTypes) || filterTypes.length === 0) {
        return [];
    }

    const typesList = filterTypes
        .map(t => `'${String(t).replace(/'/g, "''")}'`)
        .join(',');

    const query = `
        SELECT
            id_parcel as id,
            com_parc as commune_code,
            COUNT(*) as nb_cultures,
            SUM(CAST(surf_parc AS FLOAT)) as surface_totale,
            SUM(CAST(alt_mean AS FLOAT) * CAST(surf_parc AS FLOAT)) 
                / SUM(CAST(surf_parc AS FLOAT)) as altitude,
            SUM(CAST(pente_mean AS FLOAT) * CAST(surf_parc AS FLOAT)) 
                / SUM(CAST(surf_parc AS FLOAT)) as pente,
            string_agg(
                libelle_group || ':' || surf_parc || ':' || alt_mean || ':' || pente_mean,
                ', '
            ) as parcelles_details
        FROM 'data.parquet'
        WHERE libelle_group IN (${typesList})
            AND com_parc = '${communeCode}'
        GROUP BY id_parcel, com_parc
    `;

    const result = await conn.query(query);

    return result.toArray().map(r => ({
        id: String(r.id),
        commune_code: String(r.commune_code).padStart(5, '0'),
        nb_parcelles: r.nb_cultures,
        surface_totale: r.surface_totale,
        altitude: r.altitude,
        pente: r.pente,
        parcelles_details: r.parcelles_details
    }));
}

// Fonction pour récupérer la liste des types de prairies uniques présentes dans le dataset (pour les filtres)
export async function getUniquePrairieTypes() {
    const result = await conn.query(`SELECT DISTINCT libelle_group FROM 'data.parquet' WHERE libelle_group IS NOT NULL`);
    return result.toArray().map(r => r.libelle_group);
}
