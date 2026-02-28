// --- CONFIGURATION INITIALE ---
import * as DataManager from './dataManager.js';

let selectedPrairies = [];
async function startApp() {
    try {
        await DataManager.initData();

        // 1. Charger les ressources statiques et les types uniques
        const [regionsData, deptsData, prairieTypes] = await Promise.all([
            d3.json(URL_REGIONS),
            d3.json(URL_ALL_DEPTS),
            DataManager.getUniquePrairieTypes()
        ]);

        allDepartmentsGeojson = deptsData; 
        allRegionsFeatures = regionsData.features;

        // 2. INITIALISATION DU FILTRE (remplit selectedPrairies)
        // IMPORTANT : Vérifie que prairieTypes n'est pas vide ici
        initPrairieFilter(prairieTypes);
        
        // 3. APPEL DUCKDB (On passe explicitement selectedPrairies)
        // Si prairieTypes était vide, selectedPrairies le sera aussi, 
        // d'où la sécurité ajoutée dans le DataManager ci-dessus.
        const regionStats = await DataManager.getAggregatedData('reg_parc', selectedPrairies);

        allRegionsFeatures.forEach(f => {
            const stats = regionStats.get(String(f.properties.code));
            f.properties.value = stats || null; // Utilise null pour le noir
        });

        drawFeatures(layerRegions, allRegionsFeatures, "region", handleRegionClick);
        updateColorsAndLegend(allRegionsFeatures);

    } catch (error) {
        console.error("Erreur au démarrage :", error);
    }
}

startApp(); // Lancement de l'application après l'initialisation des données

const width = 800;
const height = 800;

const svg = d3.select("#map")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

const g = svg.append("g"); 

const projection = d3.geoConicConformal()
    .center([2.454071, 46.279229])
    .scale(3500)
    .translate([width / 2, height / 2]);

const path = d3.geoPath().projection(projection);

let currentLevel = "region"; 
let activeRegion = null;
let activeDepartment = null;
let allDepartmentsGeojson = null;
let allRegionsFeatures = null;

const layerRegions = g.append("g").attr("id", "regions");
const layerDepts = g.append("g").attr("id", "departments");
const layerCommunes = g.append("g").attr("id", "communes");

const URL_REGIONS = "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/regions.geojson";
const URL_ALL_DEPTS = "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements.geojson";
const getRegionDeptsMetaUrl = (regionCode) => `https://geo.api.gouv.fr/regions/${regionCode}/departements`;
const getCommunesUrl = (deptCode) => `https://geo.api.gouv.fr/departements/${deptCode}/communes?format=geojson&geometry=contour`;

const customBlueInterpolator = t => d3.interpolateBlues(d3.scaleLinear().domain([0, 1]).range([0.2, 1])(t));
const customPurpleInterpolator = t => d3.interpolatePurples(d3.scaleLinear().domain([0, 1]).range([0.2, 1])(t));

const colorScale = d3.scaleSequential(customPurpleInterpolator);
const tooltip = d3.select("#tooltip");
// Variable pour suivre l'indicateur sélectionné par l'utilisateur
let currentIndicator = "altitude"; 

// --- CONSTRUCTION DE LA LÉGENDE (DÉGRADÉ CONTINU) ---
const legendWidth = 250;
const legendHeight = 45;
const legendMargin = 15;
const gradientWidth = legendWidth - (legendMargin * 2);

d3.select("#legend").selectAll("*").remove(); 

const legendSvg = d3.select("#legend")
    .append("svg")
    .attr("width", legendWidth)
    .attr("height", legendHeight);

const defs = legendSvg.append("defs");
const linearGradient = defs.append("linearGradient")
    .attr("id", "linear-gradient")
    .attr("x1", "0%").attr("y1", "0%")
    .attr("x2", "100%").attr("y2", "0%");

// On utilise l'échelle de couleur actuelle (Viridis ou Blues)
const colorStops = d3.range(0, 1.1, 0.1);
linearGradient.selectAll("stop")
    .data(colorStops)
    .enter().append("stop")
    .attr("offset", d => `${d * 100}%`)
    .attr("stop-color", d => colorScale.interpolator()(d));

legendSvg.append("rect")
    .attr("width", gradientWidth)
    .attr("height", 12)
    .attr("x", legendMargin)
    .attr("y", 0)
    .style("fill", "url(#linear-gradient)");

// On prépare le groupe qui accueillera les chiffres
const legendAxisGroup = legendSvg.append("g")
    .attr("id", "legend-axis-group")
    .attr("transform", `translate(${legendMargin}, 12)`);

// --- OPTIONNEL : AJOUT DE L'INDICATEUR "SANS DONNÉES" ---
const noDataGroup = legendSvg.append("g")
    .attr("transform", `translate(${legendMargin}, 35)`);

noDataGroup.append("rect")
    .attr("width", 10).attr("height", 10)
    .attr("fill", "#000000");

noDataGroup.append("text")
    .attr("x", 15).attr("y", 9)
    .style("font-size", "10px")
    .text("Pas de données");



function initPrairieFilter(types) {
    // 1. Initialisation de la variable globale
    selectedPrairies = [...types];
    
    const container = d3.select("#prairie-checkboxes");
    if (container.empty()) return;
    container.selectAll("*").remove();

    const btn = d3.select("#dropdown-btn");

    btn.on("click", function(event) {
        event.stopPropagation();
        const isOpen = container.classed("show");
        container.classed("show", !isOpen);
    });

    // 3. Génération propre des éléments
    const items = container.selectAll(".checkbox-item")
        .data(types)
        .enter()
        .append("label")
        .attr("class", "checkbox-item");

    // On ajoute l'input séparément pour mieux contrôler l'événement
    items.append("input")
        .attr("type", "checkbox")
        .attr("value", d => d)
        .property("checked", true)
        .on("change", function() {
            // Mettre à jour la liste
            selectedPrairies = [];
            container.selectAll("input").each(function() {
                if (this.checked) selectedPrairies.push(this.value);
            });

            // Mise à jour du texte du bouton
            updateButtonText(btn, types.length);

            // Lancer le rafraîchissement
            refreshDataWithFilters();
        });

    items.append("span")
        .text(d => d);
}

// Petite fonction utilitaire pour la clarté
function updateButtonText(btn, totalCount) {
    if (selectedPrairies.length === totalCount) {
        btn.html("Tous les types <span style='font-size:10px'>▼</span>");
    } else if (selectedPrairies.length === 0) {
        btn.html("Aucun <span style='font-size:10px'>▼</span>");
    } else {
        btn.html(`${selectedPrairies.length} types <span style='font-size:10px'>▼</span>`);
    }
}

// --- CONFIGURATION DU ZOOM MANUEL ---
const zoom = d3.zoom()
    .scaleExtent([1, 40])
    .on("zoom", (event) => {
        g.attr("transform", event.transform);
    });

svg.call(zoom);


// --- MISE À JOUR DU PANNEAU LATÉRAL DYNAMIQUE ---
function updateSidePanel(feature, levelName, currentMax) {
    // SÉCURITÉ : Si feature est null ou undefined, on arrête tout
    if (!feature || !feature.properties) {
        console.warn(`updateSidePanel : Aucune donnée pour le niveau ${level}`);
        document.getElementById("panel-title").innerText = "Sélectionnez une zone";
        return;
    }
    const title = d3.select("#info-title");
    const content = d3.select("#info-content");
    const typePrairie = feature.properties.type_prairie;

    content.html(`
        <div class="data-row"><strong>Type :</strong> <span>${typePrairie}</span></div>
        `);

    if (!feature) {
        title.text("Vue globale");
        content.html('<p style="color: #6c757d;">Cliquez sur une région ou un département pour afficher les détails.</p>');
        return;
    }

    const nom = feature.properties.nom;
    
    // On récupère la valeur selon l'indicateur sélectionné dans le menu
    const val = feature.properties.value[currentIndicator];

    // Configuration dynamique du label et de l'unité
    const isAltitude = currentIndicator === "altitude";
    const label = isAltitude ? "Altitude moyenne" : "Pente moyenne";
    const unite = isAltitude ? "m" : "°";

    title.text(nom);
    content.html(`
        <div class="data-row"><strong>Niveau :</strong> <span>${levelName}</span></div>
        <div class="data-row">
            <strong>${label} :</strong> 
            <span style="color:#007bff; font-weight:bold; font-size: 16px;">${val} ${unite}</span>
        </div>
        <hr style="border:0; border-top:1px solid #e9ecef; margin: 20px 0;">
        <p style="font-size: 13px; color: #6c757d; margin-bottom: 5px;">Proportion par rapport au maximum affiché (${currentMax} ${unite}) :</p>
        <div id="bar-chart-container" style="height: 60px; display:flex; align-items:flex-end; gap:10px; margin-top: 10px;"></div>
    `);

    // --- Petit graphique D3.js ---
    const chartContainer = d3.select("#bar-chart-container");
    const barWidth = 40;
    const chartHeight = 60;

    // Sécurité pour éviter une division par zéro si le max est 0
    const heightRatio = currentMax > 0 ? (val / currentMax) : 0;

    // Barre représentant la zone cliquée
    chartContainer.append("div")
        .style("width", `${barWidth}px`)
        .style("height", `${heightRatio * chartHeight}px`)
        .style("background-color", colorScale(val)) // Utilise la même couleur que la carte !
        .style("border", "1px solid #333")
        .style("border-radius", "3px 3px 0 0")
        .attr("title", `Valeur : ${val} ${unite}`);

    // Texte sous la barre
    chartContainer.append("span")
        .style("font-size", "12px")
        .style("font-weight", "bold")
        .text("Zone sélectionnée");
}


// --- FONCTION DE DESSIN OPTIMISÉE ---
function drawFeatures(layer, features, className, clickHandler) {
    layer.selectAll("path")
        .data(features, d => d.properties.code || d.properties.nom)
        .join("path") 
        .attr("d", path)
        .attr("class", className)
        // 1. PROTECTION DU REMPLISSAGE (FILL)
        .attr("fill", d => {
            const val = (d.properties && d.properties.value) ? d.properties.value[currentIndicator] : null;
            return val !== null ? colorScale(val) : "#000000"; // Noir si null
        })
        .on("click", clickHandler)
        .on("mouseover", function(event, d) {
            d3.select(this).raise();
            tooltip.style("opacity", 1);
            
            // 2. PROTECTION DE L'INFOBULLE
            const val = (d.properties && d.properties.value) ? d.properties.value[currentIndicator] : null;
            const label = currentIndicator === "altitude" ? "Altitude" : "Pente";
            const unite = currentIndicator === "altitude" ? "m" : "°"; // Changé ° en % pour la pente si besoin
            
            // On affiche la valeur si elle existe, sinon "Pas de données"
            const displayVal = val !== null ? `${val.toFixed(1)} ${unite}` : "Donnée indisponible";
            
            tooltip.html(`<strong>${d.properties.nom || d.properties.name}</strong><br>${label} : ${displayVal}`);
        })
        .on("mousemove", function(event) {
            const [x, y] = d3.pointer(event, document.getElementById('map-container'));
            tooltip.style("left", (x + 15) + "px")
                   .style("top", (y - 30) + "px");
        })
        .on("mouseout", function() {
            tooltip.style("opacity", 0);
        });
}


// --- MISE À JOUR DES COULEURS ET DE LA LÉGENDE ---
function updateColorsAndLegend(features) {
    // 1. On filtre les valeurs pour l'échelle
    const values = features
        .map(f => f.properties.value ? f.properties.value[currentIndicator] : null)
        .filter(v => v !== null && v !== undefined);

    if (values.length === 0) {
        // On ne cible que les éléments de la carte, pas la légende !
        d3.selectAll(".region, .department, .commune").transition().attr("fill", "#000000");
        return;
    }

    const minMax = [d3.min(values), d3.max(values)];
    colorScale.domain(minMax);

    // 2. Mise à jour ciblée des couleurs
    // On utilise les classes CSS que tu as définies dans drawFeatures
    d3.selectAll(".region, .department, .commune")
        .transition()
        .duration(500)
        .attr("fill", function(d) {
            // SÉCURITÉ : On vérifie si d et d.properties existent
            if (!d || !d.properties) return "#000000";
            
            const val = d.properties.value ? d.properties.value[currentIndicator] : null;
            return val !== null ? colorScale(val) : "#000000";
        });

    // 3. Mise à jour de la légende (chiffres sous le dégradé)
    updateLegendUI(minMax[0], minMax[1]);
}


function renderLegendAxis() {
    const axisContainer = d3.select("#legend-axis");
    
    // On crée l'axe avec D3
    const axis = d3.axisBottom(legendScale)
        .ticks(5)
        .tickFormat(d => `${d.toFixed(1)}${currentIndicator === "altitude" ? 'm' : '°'}`);

    // On l'injecte dans le conteneur (en effaçant l'ancien)
    axisContainer.selectAll("*").remove();
    axisContainer.transition().duration(500).call(axis);
}


function updateLegendUI(min, max) {
    const legendScale = d3.scaleLinear()
        .domain([min, max])
        .range([0, gradientWidth]);

    const legendAxis = d3.axisBottom(legendScale)
        .ticks(5)
        .tickFormat(d => {
            const unit = currentIndicator === "altitude" ? "m" : "%";
            return `${Math.round(d)}${unit}`;
        });

    // On met à jour l'axe avec une transition fluide
    d3.select("#legend-axis-group")
        .transition().duration(500)
        .call(legendAxis);
        
    // On met aussi à jour les couleurs du dégradé si l'interpolateur a changé
    d3.selectAll("#linear-gradient stop")
        .attr("stop-color", (d, i, nodes) => {
            const offset = i / (nodes.length - 1);
            return colorScale.interpolator()(offset);
        });
}


// --- GESTION DU ZOOM  ---
function zoomToFeature(feature, maxZoom = 20) {
    if (!feature) return resetZoom();

    const bounds = path.bounds(feature);
    const dx = bounds[1][0] - bounds[0][0];
    const dy = bounds[1][1] - bounds[0][1];
    const x = (bounds[0][0] + bounds[1][0]) / 2;
    const y = (bounds[0][1] + bounds[1][1]) / 2;
    
    // On utilise maxZoom pour empêcher d'être "trop près" des petites zones
    const scale = Math.max(1, Math.min(maxZoom, 0.8 / Math.max(dx / width, dy / height)));
    const transform = d3.zoomIdentity.translate(width / 2 - scale * x, height / 2 - scale * y).scale(scale);

    svg.transition().duration(750).call(zoom.transform, transform);
}

function resetZoom() {
    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
}


// --- GESTION DES CLICS ---
// --- Clic sur une région ---
async function handleRegionClick(event, d) {
    // SÉCURITÉ : Si le chargement initial n'est pas fini, on ne fait rien
    if (!allDepartmentsGeojson || !allDepartmentsGeojson.features) {
        console.warn("Les données géographiques des départements ne sont pas encore prêtes.");
        return;
    }

    const regCode = String(d.properties.code);
    activeRegion = d;

    // 1. Nettoyage immédiat de l'interface
    layerDepts.selectAll("path").remove();
    layerCommunes.selectAll("path").remove();
    g.select("#altitude-symbols").remove(); 

    // 2. Chargement groupé (Géo-métadonnées + Stats DuckDB)
    // On récupère la liste des départements de la région ET les stats réelles
    const [deptsMeta, deptsStats] = await Promise.all([
        d3.json(getRegionDeptsMetaUrl(regCode)),
        DataManager.getAggregatedData('dep_parc', selectedPrairies)
    ]);

    // Sécurité : vérifier si l'utilisateur n'a pas cliqué ailleurs entre temps
    if (activeRegion && String(activeRegion.properties.code) !== regCode) return;
    
    // 3. Filtrage et Jointure
    const validDeptCodes = deptsMeta.map(dept => String(dept.code));
    const regionDeptsFeatures = allDepartmentsGeojson.features.filter(f => 
        validDeptCodes.includes(String(f.properties.code))
    );

    regionDeptsFeatures.forEach(f => {
        const stats = deptsStats.get(String(f.properties.code));
        // JOINTURE RÉELLE : On utilise les stats DuckDB
        f.properties.value = stats || null;
    });

    // 4. Mise à jour de l'état et de l'UI
    currentLevel = "department";
    layerRegions.style("opacity", 0.2); 
    layerDepts.style("opacity", 1);
    
    document.getElementById("btn-back").style.display = "block";
    document.getElementById("btn-back").innerText = "⬅ Retour aux Régions";

    // 5. Dessin et Zoom
    drawFeatures(layerDepts, regionDeptsFeatures, "department", handleDeptClick);
    
    updateSidePanel(d, "Région");
    updateColorsAndLegend(regionDeptsFeatures);
    zoomToFeature(d);

    // On retourne les features pour que le pilote auto (search) puisse continuer si besoin
    return regionDeptsFeatures;
}

// --- Clic sur un département ---
async function handleDeptClick(event, d) {
    if (event && event.stopPropagation) event.stopPropagation(); // Sécurité pour les clics
    
    const deptCode = String(d.properties.code);
    activeDepartment = d;

    // 1. Nettoyage de l'interface
    layerCommunes.selectAll("path").remove();
    g.select("#altitude-symbols").remove(); 

    // 2. Chargement en parallèle (GéoJSON des communes + Stats DuckDB)
    // On réutilise la variable geojsonData chargée ici pour éviter un second fetch
    const [geojsonData, statsMap] = await Promise.all([
        d3.json(getCommunesUrl(deptCode)),
        DataManager.getCommunesData(deptCode)
    ]);

    // Sécurité : si l'utilisateur a cliqué ailleurs pendant le chargement
    if (activeDepartment && String(activeDepartment.properties.code) !== deptCode) return;

    // 3. Jointure réelle
    geojsonData.features.forEach(f => {
        const codeInsee = String(f.properties.code);
        // On récupère les stats via le code INSEE (ex: "01001")
        f.properties.value = statsMap.get(codeInsee) || null;
    });

    // 4. Mise à jour de l'état et de l'UI
    currentLevel = "commune";
    layerDepts.style("opacity", 0.2); 
    layerCommunes.style("opacity", 1);
    
    document.getElementById("btn-back").innerText = "⬅ Retour aux Départements";

    // 5. Dessin et Zoom
    drawFeatures(layerCommunes, geojsonData.features, "commune", handleCommuneClick);

    // Calcul du max pour la légende et mise à jour du panel
    updateSidePanel(d, "Département");
    updateColorsAndLegend(geojsonData.features);
    zoomToFeature(d);

    // /!\ TRÈS IMPORTANT : On retourne les données pour que le pilote auto 
    // puisse savoir que le dessin est terminé
    return geojsonData.features;
}


// --- Clic sur une commune ---
function handleCommuneClick(event, d) {
    // 1. Sécurité : On n'appelle stopPropagation que si l'événement existe
    if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
    }

    // 2. Mise à jour des données (le "d" est fourni par le pilote auto)
    const stats = d.properties.value || null;
    
    // 3. Mise à jour du panneau latéral
    updateSidePanel(d, "Commune");

    // on zoom sur la commune sélectionnée
    zoomToFeature(d, 25); // Zoom plus serré pour les communes

    // 4. Style visuel : On réinitialise toutes les communes
    layerCommunes.selectAll("path")
        .style("stroke", "#fff")
        .style("stroke-width", "0.5px");

    // 5. Mise en évidence de la commune sélectionnée
    // Si c'est un clic manuel, on utilise event.currentTarget
    // Si c'est le pilote auto, on cherche le path par son code
    if (event && event.currentTarget) {
        d3.select(event.currentTarget)
            .raise()
            .style("stroke", "#f1c40f")
            .style("stroke-width", "2.5px");
    } else {
        // Mode Pilote Auto : on cherche l'élément dans le DOM via D3
        layerCommunes.selectAll("path")
            .filter(pathData => pathData === d)
            .raise()
            .style("stroke", "#f1c40f")
            .style("stroke-width", "2.5px");
    }
}


// --- GESTION DU BOUTON RETOUR ---
d3.select("#btn-back").on("click", async function() {
    if (currentLevel === "commune") {
        currentLevel = "department";
        
        // 1. Zoom vers le département
        if (activeRegion) {
            zoomToFeature(activeRegion, 10);
            console.log("Zoom sur le département actif avec niveau 10");
            updateSidePanel(activeDepartment, "Département");
        }
        else {
            console.log("Aucun département actif, reset du zoom");
        }

        // 2. NETTOYAGE : On supprime les communes du DOM
        // On utilise une transition pour la fluidité, puis on remove()
        layerCommunes.selectAll("path")
            .transition().duration(300)
            .style("opacity", 0)
            .remove(); // Supprime les éléments du DOM après la transition

        // 3. Réafficher les départements
        layerDepts.transition().duration(300).style("opacity", 1);
        
        document.getElementById("btn-back").innerText = "⬅ Retour aux Régions";
        refreshDataWithFilters();
    } 
    
    else if (currentLevel === "department") {
        currentLevel = "region";
        
        if (activeRegion) {
            resetZoom();
            updateSidePanel(activeRegion, "Région");
        } else {
            resetZoom();
        }

        // 2. NETTOYAGE : On supprime les départements du DOM
        layerDepts.selectAll("path")
            .transition().duration(300)
            .style("opacity", 0)
            .remove();

        // 3. Réafficher les régions
        layerRegions.transition().duration(300).style("opacity", 1);
        
        activeDepartment = null;
        d3.select(this).style("display", "none");
        refreshDataWithFilters();
    }
});


// --- GESTION DU FILTRE INDICATEUR ---
d3.select("#indicator-select").on("change", function() {
    currentIndicator = this.value; // "altitude" ou "pente"
    colorScale.interpolator(currentIndicator === "altitude" ? customPurpleInterpolator : customBlueInterpolator);
    // On détermine quelles données sont actuellement affichées à l'écran
    let activeFeatures = [];
    if (currentLevel === "commune") {
        activeFeatures = layerCommunes.selectAll("path").data();
    } else if (currentLevel === "department") {
        activeFeatures = layerDepts.selectAll("path").data();
    } else {
        activeFeatures = layerRegions.selectAll("path").data();
    }
    
    // On repeint la carte et on recadre la légende avec la nouvelle donnée
    updateColorsAndLegend(activeFeatures);
});


// --- MOTEUR DE RECHERCHE ET PILOTE AUTOMATIQUE ---

const searchInput = d3.select("#search-bar");
const searchResults = d3.select("#search-results");

searchInput.on("input", function() {
    const query = this.value.trim().toLowerCase();
    
    if (query.length < 2) {
        searchResults.style("display", "none");
        return;
    }

    // 1. Recherche locale : Régions et Départements
    const matchedRegions = allRegionsFeatures
        .filter(r => r.properties.nom.toLowerCase().includes(query))
        .map(r => ({ type: 'region', nom: r.properties.nom, code: r.properties.code }));
    
    const matchedDepts = allDepartmentsGeojson.features
        .filter(d => d.properties.nom.toLowerCase().includes(query))
        .map(d => ({ type: 'department', nom: d.properties.nom, code: d.properties.code, regionCode: d.properties.codeRegion }));

    // 2. Recherche distante (API) : Communes (on utilise l'API pour ne pas saturer la RAM)
    d3.json(`https://geo.api.gouv.fr/communes?nom=${query}&fields=nom,code,codeDepartement,codeRegion&limit=5`).then(communes => {
        const matchedCommunes = communes.map(c => ({
            type: 'commune', nom: c.nom, code: c.code, deptCode: c.codeDepartement, regionCode: c.codeRegion
        }));

        // On fusionne les résultats (max 8 éléments affichés)
        const allResults = [...matchedRegions, ...matchedDepts, ...matchedCommunes].slice(0, 8);

        if (allResults.length > 0) {
            searchResults.style("display", "block").html("");
            
            allResults.forEach(res => {
                // Définition des couleurs et labels par type
                const typeLabel = res.type === 'region' ? 'Région' : res.type === 'department' ? 'Département' : 'Commune';
                const color = res.type === 'region' ? '#28a745' : res.type === 'department' ? '#17a2b8' : '#6f42c1';
                
                searchResults.append("div")
                    .attr("class", "search-item")
                    .html(`<span class="search-badge" style="background:${color}">${typeLabel}</span> ${res.nom}`)
                    .on("click", () => {
                        searchInput.property("value", res.nom);
                        searchResults.style("display", "none");
                        
                        // Lancement du pilote automatique !
                        jumpToLocation(res.type, res.code, res.deptCode, res.regionCode);
                    });
            });
        } else {
            searchResults.style("display", "none");
        }
    });
});

// Fermer les résultats si on clique ailleurs
d3.select("body").on("click", (event) => {
    if (event.target.id !== "search-bar") searchResults.style("display", "none");
});


// app.js

// Au changement d'une checkbox dans ton menu
function onFilterChange() {
    selectedPrairies = [];
    d3.selectAll(".prairie-checkbox:checked").each(function() {
        selectedPrairies.push(this.value);
    });

    // On relance la mise à jour des données selon le niveau actuel
    refreshDataWithFilters();
}

async function refreshDataWithFilters() {
    let statsMap;
    const currentFeatures = d3.selectAll(`.${currentLevel}`).data();
    if (!currentFeatures || currentFeatures.length === 0) return;

    if (currentLevel === "region") {
        statsMap = await DataManager.getAggregatedData('reg_parc', selectedPrairies);
    } else if (currentLevel === "department") {
        statsMap = await DataManager.getAggregatedData('dep_parc', selectedPrairies);
    } else if (currentLevel === "commune") {
        const deptCode = activeDepartment.properties.code;
        statsMap = await DataManager.getCommunesData(deptCode, selectedPrairies);
    }

    // On ré-injecte les stats filtrées dans les features
    currentFeatures.forEach(f => {
        const code = String(f.properties.code);
        f.properties.value = statsMap.get(code) || null; // Noir si plus de données avec ce filtre
    });

    updateColorsAndLegend(currentFeatures);
}

// --- LE PILOTE AUTOMATIQUE (Navigation asynchrone) ---
async function jumpToLocation(type, code, name) {
    const cleanCode = String(code);
    console.log(`🚀 Saut vers : ${name} (${type})`);

    try {
        if (type === 'region') {
            const region = allRegionsFeatures.find(f => String(f.properties.code) === cleanCode);
            if (region) await handleRegionClick(null, region);
        } 
        
        else if (type === 'department') {
            // 1. Trouver le département dans le GeoJSON global
            const deptFeature = allDepartmentsGeojson.features.find(f => String(f.properties.code) === cleanCode);
            
            // 2. Trouver à quelle région il appartient en cherchant dans les métadonnées de chaque région
            let parentRegion = null;
            for (let reg of allRegionsFeatures) {
                const deptsMeta = await d3.json(getRegionDeptsMetaUrl(reg.properties.code));
                if (deptsMeta.some(d => String(d.code) === cleanCode)) {
                    parentRegion = reg;
                    break;
                }
            }

            if (parentRegion && deptFeature) {
                await handleRegionClick(null, parentRegion);
                // On attend que la couche département soit prête
                setTimeout(() => handleDeptClick(null, deptFeature), 500);
            }
        } 
        
        else if (type === 'commune') {
            const deptCode = cleanCode.startsWith('97') ? cleanCode.substring(0, 3) : cleanCode.substring(0, 2);
            
            // Retrouver le département et sa région via l'API
            let parentRegion = null;
            for (let reg of allRegionsFeatures) {
                const deptsMeta = await d3.json(getRegionDeptsMetaUrl(reg.properties.code));
                if (deptsMeta.some(d => String(d.code) === String(deptCode))) {
                    parentRegion = reg;
                    break;
                }
            }

            const deptFeature = allDepartmentsGeojson.features.find(f => String(f.properties.code) === String(deptCode));

            if (parentRegion && deptFeature) {
                await handleRegionClick(null, parentRegion);
                
                setTimeout(async () => {
                    // handleDeptClick charge les communes et renvoie les features
                    const communesFeatures = await handleDeptClick(null, deptFeature);
                    
                    // On cherche Lyon dans les features chargées
                    const commune = communesFeatures.find(f => String(f.properties.code) === cleanCode);
                    
                    if (commune) {
                        // On attend un court instant que D3 ait fini de générer les balises <path>
                        setTimeout(() => {
                            // 1. Zoomer sur la commune
                            zoomToFeature(commune);
                            
                            // 2. Afficher les infos dans le panel
                            handleCommuneClick(null, commune);
                            
                            // 3. La mettre en évidence visuellement sur la carte
                            layerCommunes.selectAll("path")
                                .filter(d => String(d.properties.code) === cleanCode)
                                .raise()
                                .style("stroke", "#f1c40f")
                                .style("stroke-width", "3px")
                                .style("fill-opacity", 1);
                        }, 600); // Temps suffisant pour que le dessin et le zoom s'amorcent
                    }
                }, 500);
            }
        }
    } catch (err) {
        console.error("❌ Erreur lors du saut via API :", err);
    }

    d3.select("#search-bar").property("value", "");
    d3.select("#search-results").style("display", "none");
}