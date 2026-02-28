// dataManager.js
import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';
let db, conn;

export async function initData() {
    console.log("Démarrage du moteur DuckDB...");
    
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
    const worker_url = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], {type: 'text/javascript'})
    );

    const worker = new Worker(worker_url);
    const logger = new duckdb.ConsoleLogger();
    
    // CORRECTION : On ne met pas "const" ici, on utilise les variables du dessus
    db = new duckdb.AsyncDuckDB(logger, worker); 
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(worker_url);

    conn = await db.connect(); 

    console.log("Chargement et fusion des chunks Parquet...");
    const arrayBuffer = await fetchAndMerge();
    
    // On enregistre le buffer sous le nom 'data.parquet'
    await db.registerFileBuffer('data.parquet', new Uint8Array(arrayBuffer));

    console.log("🚀 DuckDB prêt avec data.parquet fusionné !");
}


async function fetchAndMerge() {
    const chunks = ['data.parquet.aa', 'data.parquet.ab', 'data.parquet.ac', 'data.parquet.ad'];
    
    // 1. Fetch all chunks in parallel
    const promises = chunks.map(url => fetch(url).then(res => res.arrayBuffer()));
    const buffers = await Promise.all(promises);

    // 2. Calculate total size
    const totalLength = buffers.reduce((acc, buf) => acc + buf.byteLength, 0);
    const combinedArray = new Uint8Array(totalLength);

    // 3. Manually copy each buffer into the giant array
    let offset = 0;
    for (const buf of buffers) {
        combinedArray.set(new Uint8Array(buf), offset);
        offset += buf.byteLength;
    }

    // Now 'combinedArray' has the magic bytes at the end and can be read
    return combinedArray;
}

/**
 * Récupère les données agrégées pour les régions ou départements
 * @param {string} levelColumn 'reg_parc' ou 'dep_parc'
 */


export async function getAggregatedData(levelColumn, filterTypes = []) {
    if (!Array.isArray(filterTypes) || filterTypes.length === 0) return new Map();

    try {
        const typesList = filterTypes
            .map(t => `'${String(t).replace(/'/g, "''")}'`)
            .join(',');

        // 1. On calcule les stats par (Zone + Culture)
        // 2. On agrège ensuite par Zone
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

export async function getCommunesData(deptCode, filterTypes = []) {
    if (!Array.isArray(filterTypes) || filterTypes.length === 0) return new Map();

    // Ici on filtre sur le département et on groupe par code commune (com_parc)
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
    // On s'assure que le code est une chaîne (ex: "01001") pour matcher le GeoJSON
    return new Map(result.toArray().map(r => [String(r.code).padStart(5, '0'), r]));
}

/**
 * Récupère la liste des types de prairies (groupes de culture)
 */
export async function getUniquePrairieTypes() {
    const result = await conn.query(`SELECT DISTINCT libelle_group FROM 'data.parquet' WHERE libelle_group IS NOT NULL`);
    return result.toArray().map(r => r.libelle_group);
}