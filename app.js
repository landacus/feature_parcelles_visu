import * as DataManager from './dataManager.js';

let selectedPrairies = [];
let scatterHistory = [];

// Fonction pour le chargement initial de la carte et des données
async function startApp() {
    try {
        await DataManager.initData();
        const [regionsData, deptsData, prairieTypes] = await Promise.all([
            d3.json(URL_REGIONS),
            d3.json(URL_ALL_DEPTS),
            DataManager.getUniquePrairieTypes()
        ]);

        allDepartmentsGeojson = deptsData; 
        allRegionsFeatures = regionsData.features;

        initPrairieFilter(prairieTypes);
        
        const regionStats = await DataManager.getAggregatedData('reg_parc', selectedPrairies);
        console.log("Stats régionales récupérées :", regionStats);

        allRegionsFeatures.forEach(f => {
            const stats = regionStats.get(String(f.properties.code));
            f.properties.value = stats || null;
        });

        drawFeatures(layerRegions, allRegionsFeatures, "region", handleRegionClick);
        updateColorsAndLegend(allRegionsFeatures);

    } catch (error) {
        console.error("Erreur au démarrage :", error);
    }
}

startApp();

// Configuration de la carte
const width = 800;
const height = 800;
const svg = d3.select("#map")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

const g = svg.append("g"); 
const projection = d3.geoConicConformal()
    .center([2.454071, 46.279229]) // Centre de la France
    .scale(3500)
    .translate([width / 2, height / 2]);

const path = d3.geoPath().projection(projection);

// Suivi de l'état de la carte
let currentLevel = "region"; 
let activeRegion = null;
let activeDepartment = null;
let allDepartmentsGeojson = null;
let allRegionsFeatures = null;
let currentIndicator = "altitude"; 

// Calques pour les régions, départements et communes
const layerRegions = g.append("g").attr("id", "regions");
const layerDepts = g.append("g").attr("id", "departments");
const layerCommunes = g.append("g").attr("id", "communes");

// Récupération des données sur les communes, départements ou régions pour la construction de la carte
const URL_REGIONS = "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/regions.geojson";
const URL_ALL_DEPTS = "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements.geojson";
const getRegionDeptsMetaUrl = (regionCode) => `https://geo.api.gouv.fr/regions/${regionCode}/departements`;
const getCommunesUrl = (deptCode) => `https://geo.api.gouv.fr/departements/${deptCode}/communes?format=geojson&geometry=contour`;

// Configuration des échelles de couleurs personnalisées pour les indicateurs
const customBlueInterpolator = t => d3.interpolateBlues(d3.scaleLinear().domain([0, 1]).range([0.2, 1])(t));
const customPurpleInterpolator = t => d3.interpolatePurples(d3.scaleLinear().domain([0, 1]).range([0.2, 1])(t));
const colorScale = d3.scaleSequential(customPurpleInterpolator);

// configuration du zoom pour la carte
const zoom = d3.zoom()
    .scaleExtent([1, 40])
    .on("zoom", (event) => {
        g.attr("transform", event.transform);
    });

svg.call(zoom);

const tooltip = d3.select("#tooltip");

// Construction de la légende
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

const legendAxisGroup = legendSvg.append("g")
    .attr("id", "legend-axis-group")
    .attr("transform", `translate(${legendMargin}, 12)`);
const noDataGroup = legendSvg.append("g")
    .attr("transform", `translate(${legendMargin}, 35)`);
noDataGroup.append("rect")
    .attr("width", 10).attr("height", 10)
    .attr("fill", "#000000");
noDataGroup.append("text")
    .attr("x", 15).attr("y", 9)
    .style("font-size", "10px")
    .text("Pas de données");


// Fonction pour initialiser le filtre de sélection des types de prairies
function initPrairieFilter(types) {
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

    const items = container.selectAll(".checkbox-item")
        .data(types)
        .enter()
        .append("label")
        .attr("class", "checkbox-item");

    items.append("input")
        .attr("type", "checkbox")
        .attr("value", d => d)
        .property("checked", true)
        .on("change", function() {
            selectedPrairies = [];
            container.selectAll("input").each(function() {
                if (this.checked) selectedPrairies.push(this.value);
            });

            updateButtonText(btn, types.length);
            refreshDataWithFilters();
        });

    items.append("span")
        .text(d => d);
}

// Fonction pour le texte du bouton de sélection des types de prairies
function updateButtonText(btn, totalCount) {
    if (selectedPrairies.length === totalCount) {
        btn.html("Tous les types <span style='font-size:10px'>▼</span>");
    } else if (selectedPrairies.length === 0) {
        btn.html("Aucun <span style='font-size:10px'>▼</span>");
    } else {
        btn.html(`${selectedPrairies.length} types <span style='font-size:10px'>▼</span>`);
    }
}

// Fonction pour mettre à jour les infos du panneau latéral
function updateSidePanel(feature, level) {
    if (!feature || !feature.properties) 
        return;

    const props = feature.properties;
    const stats = props.value;

    document.getElementById("info-title").innerText = props.nom || props.name;
    document.getElementById("panel-level").innerText = level;

    if (stats) {
        document.getElementById("nb-parcelles").innerText = stats.nb_parcelles.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
        document.getElementById("alt-val").innerText = `${stats.altitude.toFixed(1)} m`;
        document.getElementById("pente-val").innerText = `${stats.pente.toFixed(1)} %`;
        const top5Data = calculateTop5Data(stats.parcelles_details);
        drawTop5Chart(top5Data, "#top-prairies-chart");
    } else {
        document.getElementById("nb-parcelles").innerText = "0";
        document.getElementById("alt-val").innerText = "-";
        document.getElementById("pente-val").innerText = "-";
        document.getElementById("top-prairies").innerHTML = "<li>Aucune donnée</li>";
    }
}


// Fonction pour dessiner les zones sur la carte (régions, départements ou communes) avec les bonnes couleurs et interactions
function drawFeatures(layer, features, className, clickHandler) {
    layer.selectAll("path")
        .data(features, d => d.properties.code || d.properties.nom)
        .join("path") 
        .attr("d", path)
        .attr("class", className)
        .attr("fill", d => {
            const val = (d.properties && d.properties.value) ? d.properties.value[currentIndicator] : null;
            return val !== null ? colorScale(val) : "#000000";
        })
        .on("click", clickHandler)
        .on("mouseover", function(event, d) {
            layer.selectAll("path")
                .style("stroke", "#fff")
                .style("stroke-width", "0.5px");
            d3.select(this)
                .raise()
                .style("stroke", "#000")
                .style("stroke-width", "1px");
            tooltip.style("opacity", 1);
            const val = (d.properties && d.properties.value)
                ? d.properties.value[currentIndicator]
                : null;
            const label = currentIndicator === "altitude" ? "Altitude" : "Pente";
            const unite = currentIndicator === "altitude" ? "m" : "°";
            const displayVal = val !== null
                ? `${val.toFixed(1)} ${unite}`
                : "Donnée indisponible";
            tooltip.html(`<strong>${d.properties.nom}</strong><br>${label} : ${displayVal}`);
        })
        .on("mouseout", function() {
            d3.select(this)
                .style("stroke", "#fff")
                .style("stroke-width", "0.5px");
            tooltip.style("opacity", 0);
        })
        .on("mousemove", function(event) {
            const [x, y] = d3.pointer(event, document.getElementById('map-container'));
            tooltip.style("left", (x + 15) + "px")
                   .style("top", (y - 30) + "px");
        });
}


// Fonction pour mettre à jour les couleurs des zones affichées et la légende en fonction
// l'indicateur sélectionné et de l'échelle
function updateColorsAndLegend(features) {
    const values = features
        .map(f => f.properties.value ? f.properties.value[currentIndicator] : null)
        .filter(v => v !== null && v !== undefined);

    if (values.length === 0) {
        d3.selectAll(".region, .department, .commune").transition().attr("fill", "#000000");
        return;
    }

    const minMax = [d3.min(values), d3.max(values)];
    colorScale.domain(minMax);

    d3.selectAll(".region, .department, .commune")
        .transition()
        .duration(500)
        .attr("fill", function(d) {
            if (!d || !d.properties) return "#000000";
            
            const val = d.properties.value ? d.properties.value[currentIndicator] : null;
            return val !== null ? colorScale(val) : "#000000";
        });
    updateLegendUI(minMax[0], minMax[1]);
}

// Foncion pour mettre à jour les graduations de la légende
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

    d3.select("#legend-axis-group")
        .call(legendAxis);
        
    d3.selectAll("#linear-gradient stop")
        .attr("stop-color", (d, i, nodes) => {
            const offset = i / (nodes.length - 1);
            return colorScale.interpolator()(offset);
        });
}


// Fonction de zoom sur une zone sélectionnée
function zoomToFeature(feature, maxZoom = 20) {
    if (!feature) 
        return resetZoom();

    // Récupére des coordonnées de la zone et calcul du centre et du facteur de zoom
    const bounds = path.bounds(feature); 
    const dx = bounds[1][0] - bounds[0][0];
    const dy = bounds[1][1] - bounds[0][1];
    const x = (bounds[0][0] + bounds[1][0]) / 2;
    const y = (bounds[0][1] + bounds[1][1]) / 2;
    const scale = Math.max(1, Math.min(maxZoom, 0.8 / Math.max(dx / width, dy / height)));
    const transform = d3.zoomIdentity.translate(width / 2 - scale * x, height / 2 - scale * y).scale(scale);

    svg.transition().duration(750).call(zoom.transform, transform);
}

// Fonction pour réinitialiser le zoom à l'état initial (vue d'ensemble de la France)
function resetZoom() {
    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
}


// Fonction de gestion du clic sur une région : Affiche les départements de la région avec les données agrégées
async function handleRegionClick(event, d) {
    if (!allDepartmentsGeojson || !allDepartmentsGeojson.features) {
        console.warn("Les données géographiques des départements ne sont pas encore prêtes.");
        return;
    }

    const regCode = String(d.properties.code);
    activeRegion = d;

    // On retire les éléments inférieurs
    layerDepts.selectAll("path").remove();
    layerCommunes.selectAll("path").remove();
    g.select("#altitude-symbols").remove(); 

    const [deptsMeta, deptsStats] = await Promise.all([
        d3.json(getRegionDeptsMetaUrl(regCode)),
        DataManager.getAggregatedData('dep_parc', selectedPrairies)
    ]);
    
    const validDeptCodes = deptsMeta.map(dept => String(dept.code));
    const regionDeptsFeatures = allDepartmentsGeojson.features.filter(f => 
        validDeptCodes.includes(String(f.properties.code))
    );

    regionDeptsFeatures.forEach(f => {
        const stats = deptsStats.get(String(f.properties.code));
        f.properties.value = stats || null;
    });


    currentLevel = "department";
    layerRegions.style("opacity", 0.2); 
    layerDepts.style("opacity", 1);
    
    document.getElementById("btn-back").style.display = "block";
    document.getElementById("btn-back").innerText = "⬅ Retour aux Régions";

    drawFeatures(layerDepts, regionDeptsFeatures, "department", handleDeptClick);
    
    updateSidePanel(d, "Région");
    updateColorsAndLegend(regionDeptsFeatures);
    zoomToFeature(d);

    return regionDeptsFeatures;
}

// Fonction de gestion du clic sur un département : Affiche les communes du département
async function handleDeptClick(event, d) {
    if (event && event.stopPropagation) 
        event.stopPropagation();
    
    const deptCode = String(d.properties.code);
    activeDepartment = d;

    // Nettoyage de l'interface
    layerCommunes.selectAll("path").remove();
    g.select("#altitude-symbols").remove(); 

    const [geojsonData, statsMap] = await Promise.all([
        d3.json(getCommunesUrl(deptCode)),
        DataManager.getCommunesData(deptCode, selectedPrairies)
    ]);
    console.log("StatsMap générée :", statsMap)

    geojsonData.features.forEach(f => {
        const codeInsee = String(f.properties.code);
        f.properties.value = statsMap.get(codeInsee) || null;
    });

    currentLevel = "commune";
    layerDepts.style("opacity", 0.2); 
    layerCommunes.style("opacity", 1);
    
    document.getElementById("btn-back").innerText = "⬅ Retour aux Départements";

    drawFeatures(layerCommunes, geojsonData.features, "commune", handleCommuneClick);

    updateSidePanel(d, "Département");
    updateColorsAndLegend(geojsonData.features);
    zoomToFeature(d);

    return geojsonData.features;
}

// Fonction de gestion du clic sur une commune : Affiche les détails de la commune dans le panneau latéral et met en évidence la commune sélectionnée
function handleCommuneClick(event, d) {
    if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
    }
    
    updateSidePanel(d, "Commune");
    zoomToFeature(d, 25);

    layerCommunes.selectAll("path")
        .style("stroke", "#fff")
        .style("stroke-width", "0.5px");

    if (event && event.currentTarget) {
        d3.select(event.currentTarget)
            .raise()
            .style("stroke", "#f1c40f")
            .style("stroke-width", "2.5px");
    } else {
        layerCommunes.selectAll("path")
            .filter(pathData => pathData === d)
            .raise()
            .style("stroke", "#f1c40f")
            .style("stroke-width", "2.5px");
    }
}


// Bouton retour pour remonter dans la hiérarchie (commune -> département -> région) 
d3.select("#btn-back").on("click", async function() {
    if (currentLevel === "commune") {
        currentLevel = "department";
        
        if (activeRegion) {
            zoomToFeature(activeRegion, 10);
            console.log("Zoom sur le département actif avec niveau 10");
            updateSidePanel(activeDepartment, "Département");
        }
        else {
            console.log("Aucun département actif, reset du zoom");
        }

        layerCommunes.selectAll("path")
            .style("opacity", 0)
            .remove();


        layerDepts.style("opacity", 1);
        
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

        layerDepts.selectAll("path")
            .style("opacity", 0)
            .remove();

        // 3. Réafficher les régions
        layerRegions.style("opacity", 1);
        
        activeDepartment = null;
        d3.select(this).style("display", "none");
        refreshDataWithFilters();
    }
});


// Filtre des indicateurs (pente ou altitude)
d3.select("#indicator-select").on("change", function() {
    currentIndicator = this.value;
    colorScale.interpolator(currentIndicator === "altitude" ? customPurpleInterpolator : customBlueInterpolator);
    let activeFeatures = [];
    if (currentLevel === "commune") {
        activeFeatures = layerCommunes.selectAll("path").data();
    } else if (currentLevel === "department") {
        activeFeatures = layerDepts.selectAll("path").data();
    } else {
        activeFeatures = layerRegions.selectAll("path").data();
    }
    
    updateColorsAndLegend(activeFeatures);
});



// Moteur de recherche pour trouver une commune, un département ou une région et y zoomer
const searchInput = d3.select("#search-bar");
const searchResults = d3.select("#search-results");

searchInput.on("input", function() {
    const query = this.value.trim().toLowerCase();
    
    if (query.length < 2) {
        searchResults.style("display", "none");
        return;
    }

    // Recherche de correspondances dans les données déjà chargées (régions et départements)
    const matchedRegions = allRegionsFeatures
        .filter(r => r.properties.nom.toLowerCase().includes(query))
        .map(r => ({ type: 'region', nom: r.properties.nom, code: r.properties.code }));
    
    const matchedDepts = allDepartmentsGeojson.features
        .filter(d => d.properties.nom.toLowerCase().includes(query))
        .map(d => ({ type: 'department', nom: d.properties.nom, code: d.properties.code, regionCode: d.properties.codeRegion }));

    // Recherche via l'API pour les communes
    d3.json(`https://geo.api.gouv.fr/communes?nom=${query}&fields=nom,code,codeDepartement,codeRegion&limit=5`).then(communes => {
        const matchedCommunes = communes.map(c => ({
            type: 'commune', nom: c.nom, code: c.code, deptCode: c.codeDepartement, regionCode: c.codeRegion
        }));

        const allResults = [...matchedRegions, ...matchedDepts, ...matchedCommunes].slice(0, 8);

        if (allResults.length > 0) {
            searchResults.style("display", "block").html("");
            
            allResults.forEach(res => {
                const typeLabel = res.type === 'region' ? 'Région' : res.type === 'department' ? 'Département' : 'Commune';
                const color = res.type === 'region' ? '#28a745' : res.type === 'department' ? '#17a2b8' : '#6f42c1';
                
                searchResults.append("div")
                    .attr("class", "search-item")
                    .html(`<span class="search-badge" style="background:${color}">${typeLabel}</span> ${res.nom}`)
                    .on("click", () => {
                        searchInput.property("value", res.nom);
                        searchResults.style("display", "none");

                        jumpToLocation(res.type, res.code);
                    });
            });
        } else {
            searchResults.style("display", "none");
        }
    });
});
d3.select("body").on("click", (event) => {
    if (event.target.id !== "search-bar") searchResults.style("display", "none");
});


// Fonction pour mettre à jour les données selon les filtres
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

    currentFeatures.forEach(f => {
        const code = String(f.properties.code);
        f.properties.value = statsMap.get(code) || null;
    });

    updateColorsAndLegend(currentFeatures);
}

// Affichage des détails en fonction du résultat de la recherche 
async function jumpToLocation(type, code) {
    const cleanCode = String(code);

    try {
        if (type === 'region') {
            const region = allRegionsFeatures.find(f => String(f.properties.code) === cleanCode);
            if (region) await handleRegionClick(null, region);
        } 
        
        else if (type === 'department') {
            const deptFeature = allDepartmentsGeojson.features.find(f => String(f.properties.code) === cleanCode);
            
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
                setTimeout(() => handleDeptClick(null, deptFeature), 500);
            }
        } 
        
        else if (type === 'commune') {
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
                    const communesFeatures = await handleDeptClick(null, deptFeature);
                    const commune = communesFeatures.find(f => String(f.properties.code) === cleanCode);
                    
                    if (commune) {
                        setTimeout(() => {
                            zoomToFeature(commune);
                            handleCommuneClick(null, commune);
                            layerCommunes.selectAll("path")
                                .filter(d => String(d.properties.code) === cleanCode)
                                .raise()
                                .style("stroke", "#f1c40f")
                                .style("stroke-width", "3px")
                                .style("fill-opacity", 1);
                        }, 600);
                    }
                }, 500);
            }
        }
    } catch (err) {
        console.error("Erreur lors du saut :", err);
    }
    d3.select("#search-bar").property("value", "");
    d3.select("#search-results").style("display", "none");
}

// Fonction pour dessiner le graphique des 5 types de prairies les plus présents
function drawTop5Chart(data, containerSelector) {
    const container = d3.select(containerSelector);
    const margin = { top: 5, right: 5, bottom: 5, left: 5 };
    const width = container.node().getBoundingClientRect().width - margin.left - margin.right;
    const height = 200 - margin.top - margin.bottom;

    container.selectAll("svg").remove();
    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const y = d3.scaleBand()
        .domain(data.map(d => d.culture))
        .range([0, height])
        .padding(0.15);

    const x = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.surface)])
        .range([0, width]);

    const colorScale = d3.scaleOrdinal()
        .range(["#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef"]);

    let tooltip = d3.select(".chart-tooltip");
    if (tooltip.empty()) tooltip = d3.select("body").append("div").attr("class", "chart-tooltip");

    const barGroups = svg.selectAll(".bar-group")
        .data(data)
        .enter()
        .append("g")
        .attr("class", "bar-group")
        .on("mousemove", function(event, d) {
            tooltip.style("opacity", 1)
                   .html(`
                    <div style="font-weight:bold; margin-bottom:5px; border-bottom:1px solid #555;">${d.culture}</div>
                    <div style="display:grid; grid-template-columns: 1fr auto; gap:8px; font-size:12px;">
                        <span>Surface:</span> <b style="text-align:right">${d.surface.toFixed(3).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ha</b>
                        <span>Altitude:</span> <b style="text-align:right">${d.alt.toFixed(0)} m</b>
                        <span>Pente:</span> <b style="text-align:right">${d.pente.toFixed(1)} %</b>
                    </div>
                   `)
                   .style("left", (event.pageX + 15) + "px")
                   .style("top", (event.pageY - 15) + "px");
            
            d3.select(this).select("rect").style("filter", "brightness(1.2)");
        })
        .on("mouseleave", function() {
            tooltip.style("opacity", 0);
            d3.select(this).select("rect").style("filter", "none");
        });

    barGroups.append("rect")
        .attr("x", 0)
        .attr("y", d => y(d.culture))
        .attr("height", y.bandwidth())
        .attr("width", 0)
        .attr("fill", (d, i) => colorScale(i))
        .attr("rx", 4)
        .transition().duration(800)
        .attr("width", d => Math.max(x(d.surface), 40));

    barGroups.append("text")
        .attr("x", 10)
        .attr("y", d => y(d.culture) + y.bandwidth() / 2)
        .attr("dy", ".35em")
        .attr("fill", "#333")
        .style("font-weight", "bold")
        .style("font-size", "12px")
        .style("pointer-events", "none")
        .text(d => `${d.surface.toFixed(3).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ha`);
}


function calculateTop5Data(detailsString) {
    if (!detailsString) return [];

    const counts = {};
    detailsString.split(',').forEach(item => {
        const parts = item.trim().split(':');
        if (parts.length >= 2) {
            const type = parts[0].trim();
            const surf = parseFloat(parts[1]) || 0;
            const alt = parseFloat(parts[2]) || 0;  
            const pente = parseFloat(parts[3]) || 0; 
            
            if (!isNaN(surf)) {
                counts[type] = {
                    surface: (counts[type]?.surface || 0) + surf,
                    alt: alt,
                    pente: pente
                };
            }
        }
    });

    return Object.entries(counts)
        .sort((a, b) => b[1].surface - a[1].surface)
        .slice(0, 5)
        .map(([culture, stats]) => ({ 
            culture, 
            surface: stats.surface,
            alt: stats.alt,
            pente: stats.pente 
        }));
}

// ===============================
// TOGGLE MAP / SCATTER
// ===============================

const mapContainer = document.getElementById("map-container");
const scatterContainer = document.getElementById("scatter-container");

document.getElementById("btn-scatter").addEventListener("click", () => {
    if (scatterContainer.style.display === "none") {
        showScatterView();
    } else {
        showMapView();
    }
});

function showScatterView() {
    mapContainer.style.display = "none";
    scatterContainer.style.display = "block";
    renderScatter();
}

function showMapView() {
    scatterContainer.style.display = "none";
    mapContainer.style.display = "block";
}

async function renderScatter(customFeatures = null, fromBack = false) {   
    
    const svg = d3.select("#scatter-svg");
    svg.selectAll("*").remove();

    const width = document.getElementById("scatter-container").clientWidth;
    const height = document.getElementById("scatter-container").clientHeight;

    const margin = { top: 40, right: 40, bottom: 60, left: 70 };

    const gScatter = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Determine which features to use
    let features = customFeatures;

    if (!features) {
        if (currentLevel === "region") {
            features = layerRegions.selectAll("path").data();
        } else if (currentLevel === "department") {
            features = layerDepts.selectAll("path").data();
        } else {
            features = layerCommunes.selectAll("path").data();
        }
    }

    const data = features
        .filter(f => f.properties.value)
        .map(f => ({
            altitude: f.properties.value.altitude,
            pente: f.properties.value.pente,
            nom: f.properties.nom,
            feature: f
        }));

    if (data.length === 0) return;

    const tooltip = d3.select("#scatter-tooltip");

    const x = d3.scaleLinear()
        .domain(d3.extent(data, d => d.altitude))
        .nice()
        .range([0, innerWidth]);

    const y = d3.scaleLinear()
        .domain(d3.extent(data, d => d.pente))
        .nice()
        .range([innerHeight, 0]);

    // Axes
    gScatter.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x));

    gScatter.append("g")
        .call(d3.axisLeft(y));

    // Points
    gScatter.selectAll("circle")
        .data(data)
        .enter()
        .append("circle")
        .attr("cx", d => x(d.altitude))
        .attr("cy", d => y(d.pente))
        .attr("r", 5)
        .attr("fill", "#007bff")
        .attr("opacity", 0.7)

        // Hover
        .on("mouseover", function(event, d) {
            d3.select(this).attr("r", 8).attr("opacity", 1);

            tooltip.style("opacity", 1)
                .html(`
                    <strong>${d.nom}</strong><br>
                    Altitude: ${d.altitude.toFixed(1)} m<br>
                    Pente: ${d.pente.toFixed(1)} %
                `);
        })
        .on("mousemove", function(event) {
            tooltip
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function() {
            d3.select(this).attr("r", 5).attr("opacity", 0.7);
            tooltip.style("opacity", 0);
        })

        // Drill-down click
        .on("click", async function(event, d) {

            d3.selectAll("#scatter-svg circle")
                .attr("stroke", null);

            d3.select(this)
                .attr("stroke", "black")
                .attr("stroke-width", 2);

            // REGION -> Departments
            if (currentLevel === "region") {

                scatterHistory.push({
                    level: "region",
                    features: features
                });

                const regCode = String(d.feature.properties.code);

                const [deptsMeta, deptsStats] = await Promise.all([
                    d3.json(getRegionDeptsMetaUrl(regCode)),
                    DataManager.getAggregatedData('dep_parc', selectedPrairies)
                ]);

                const validCodes = deptsMeta.map(dep => String(dep.code));

                const regionDepts = allDepartmentsGeojson.features
                    .filter(f => validCodes.includes(String(f.properties.code)));

                regionDepts.forEach(f => {
                    f.properties.value =
                        deptsStats.get(String(f.properties.code)) || null;
                });

                currentLevel = "department";

                updateSidePanel(d.feature, "Région");
                updateBackButton();
                renderScatter(regionDepts);
            }

            // DEPARTMENT → Communes
            else if (currentLevel === "department") {

                scatterHistory.push({
                    level: "department",
                    features: features
                });

                const deptCode = String(d.feature.properties.code);

                const [geojsonData, statsMap] = await Promise.all([
                    d3.json(getCommunesUrl(deptCode)),
                    DataManager.getCommunesData(deptCode, selectedPrairies)
                ]);

                geojsonData.features.forEach(f => {
                    f.properties.value =
                        statsMap.get(String(f.properties.code)) || null;
                });

                currentLevel = "commune";
                
                updateSidePanel(d.feature, "Département");
                updateBackButton();
                renderScatter(geojsonData.features);
            }

            // COMMUNE → Parcelles
            else if (currentLevel === "commune") {

                scatterHistory.push({
                    level: "commune",
                    features: features
                });

                const communeCode = String(d.feature.properties.code);

                const parcellesData = await DataManager.getParcellesData(
                    communeCode,
                    selectedPrairies
                );

                const parcellesFeatures = parcellesData
                    .filter(p => p.altitude && p.pente)
                    .map(p => ({
                        type: "Feature",
                        properties: {
                            code: p.id,
                            nom: `Parcelle ${p.id}`,
                            value: {
                                altitude: p.altitude,
                                pente: p.pente
                            }
                        }
                    }));

                currentLevel = "parcelle";
                
                updateSidePanel(d.feature, "Parcelles");
                updateBackButton();
                renderScatter(parcellesFeatures);
            }
        });

    // Axis labels
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", height - 10)
        .attr("text-anchor", "middle")
        .text("Altitude moyenne (m)");

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", 20)
        .attr("text-anchor", "middle")
        .text("Pente moyenne (%)");

    updateBackButton();
}

function goBackScatter() {

    if (scatterHistory.length === 0) return;

    const previous = scatterHistory.pop();

    currentLevel = previous.level;

    renderScatter(previous.features, true);

    updateBackButton();
}

document.getElementById("scatter-back-btn")
    .addEventListener("click", goBackScatter);
    
function updateBackButton() {

    const btn = document.getElementById("scatter-back-btn");

    if (scatterHistory.length > 0) {
        btn.style.display = "block";
    } else {
        btn.style.display = "none";
    }
}
