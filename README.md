# Visualisation-Prairie

On a les infos par parcelle avec les geopackage (lourd)

## Lien des documentations :
- https://geoservices.ign.fr/sites/default/files/2025-12/DC_DL_RPG_3-0.pdf
- https://entrepot.recherche.data.gouv.fr/file.xhtml?persistentId=doi:10.57745/GSXVRU&version=1.1

## Tables et colonnes intéressantes : 

### PARCELLES_GRAPHIQUES :
- id_parcel
- CODE_CULTU : Code de la culture principale de la parcelle
- CODE_GROUP : Code groupe de la culture principale
- culture_d1 : Code culture dérobée 1
- culture_d2 : Code culture dérobée 2 
- surf_parc : Surface en hectares de la parcelle (hectare)

--> Pour les codes cultures, voir le fichier REF_CULTURES_2023.csv qui répertorie les codes et libellés (lien dans la documentation geoservices)

--> une culture dérobée, c'est une plante que l'agriculteur sème entre deux cultures principales. Elle vient dérober un peu de temps et d'espace sur une période de l'année où le champ serait normalement resté nu. Puisqu'on travaille spécifiquement sur les prairies (de l'herbe qui pousse toute l'année), le sol n'est par définition jamais nu. Il n'y a donc quasiment jamais de culture dérobée sur une parcelle déclarée en prairie d'où les colonnes 'culture_d1' et "culture_d2' vides en général.


### RPG2023_sol_climat : 
- id_parcel
- com_parc : Code commune 
- pct_com : Part de la surface de la parcelle située dans la commune indiquée (%)
- dep_parc : Code département
- reg_parc : Code région
- alt_mean : Altitude moyenne de la parcelle (m)
- alt_min : Altitude minimale de la parcelle (m)
- alt_max : Altitude maximale de la parcelle (m)
- pente_mean : Pente moyenne de la parcelle (m)
- expo_mean : Orientation moyenne de la parcelle (degrés)
- expo : Orientation de la parcelle (S, N, SE, ...)


### Dans le doc REF_CULTURES_2023.csv :
- code : code culture
- libelle_culture : description du code culture (ex: vanille verte)


--> Pour obtenir parcelles_consolidees.csv on a fait une jointure avec id_parcel comme clé
Le fichier à la structure suivante : 
- id_parcel
- surf_parc : Surface en hectares de la parcelle (hectare)
- code_cultu : Code de la culture principale de la parcelle
- libelle_culture : description du code culture (ex: vanille verte)
- code_group : Code groupe de la culture principale
- libelle_group : description du groupe de culture
- com_parc : Code commune 
- pct_com : Part de la surface de la parcelle située dans la commune indiquée (%)
- dep_parc : Code département
- reg_parc : Code région
- alt_mean : Altitude moyenne de la parcelle (m)
- alt_min : Altitude minimale de la parcelle (m)
- alt_max : Altitude maximale de la parcelle (m)
- pente_mean : Pente moyenne de la parcelle (m)
- expo_mean : Orientation moyenne de la parcelle (degrés)
- expo : Orientation de la parcelle (S, N, SE, ...)

## Visualisation des données : 

1. Carte de France : 
--> On choisit à quelle échelle on visualise les prairies : 
- région
- département
- commune
--> Légende :
- couleur = altitude moyenne
- inclinaison flèche = pente moyenne

2. Filtres :
On peut filtrer sur un histogramme selon l'intervalle (on sélectionne un min et max sur l'histogramme) sur :
- alt_min
- alt_max
- pente_mean
On peut filtrer aussi selon : 
- code_cultu / libelle_culture
- code_group / libelle_group

Quand on clique sur une entité (région / département / commune), on voit : 
- le nom de l'entité (région / département / commune)
- la surface totale en prairie
- le nombre de prairie
- un mini histogramme de pente et d'altitude avec les valeurs moyennes
- le top 3 des groupes de culture avec 
	- leur pourcentage en surface
	- la pente moyenne
	- l'altitude moyenne

