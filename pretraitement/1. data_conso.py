import sqlite3
import csv
import os

# REF_CULTURES_2023.csv : provient de https://entrepot.recherche.data.gouv.fr/dataverse/RPG_sol_climat
# REF_CULTURES_GROUPES_CULTURES_2023.csv : provient de https://entrepot.recherche.data.gouv.fr/dataverse/RPG_sol_climat
# PARCELLES_GRAPHIQUES.db : provient de https://geoservices.ign.fr/rpg

script_dir = os.path.dirname(os.path.abspath(__file__))

cultures_dict = {}
csv_path_culture = os.path.join(script_dir, 'REF_CULTURES_2023.csv')
try:
    with open(csv_path_culture, mode='r', encoding='latin-1') as f:
        reader = csv.DictReader(f, delimiter=';') 
        for row in reader:
            cultures_dict[row['CODE']] = row['LIBELLE_CULTURE']
except FileNotFoundError:
    print(f"Fichier {csv_path_culture} introuvable.")
    
group_dict = {}
csv_path_group = os.path.join(script_dir, 'REF_CULTURES_GROUPES_CULTURES_2023.csv')
try:
    with open(csv_path_group, mode='r', encoding='latin-1') as f:
        reader = csv.DictReader(f, delimiter=';') 
        for row in reader:
            group_dict[row['CODE_GROUPE_CULTURE']] = row['LIBELLE_GROUPE_CULTURE']
except FileNotFoundError:
    print(f"Fichier {csv_path_group} introuvable.")


db_path = os.path.join(script_dir, 'PARCELLES_GRAPHIQUES.db')
conn = sqlite3.connect(db_path) 
cursor = conn.cursor()


query = """
SELECT 
    p.ID_PARCEL,
    p.SURF_PARC,
    p.CODE_CULTU,
    p.CODE_GROUP,
    s.com_parc,
    s.pct_com,
    s.dep_parc,
    s.reg_parc,
    s.alt_mean,
    s.alt_min,
    s.alt_max,
    s.pente_mean,
    s.expo_mean,
    s.expo
FROM PARCELLES_GRAPHIQUES p
JOIN RPG2023_sol_climat s ON p.ID_PARCEL = CAST(s.id_parcel AS TEXT)
"""

print("Lancement de la requête de jointure dans la base...")
cursor.execute(query)

output_path = os.path.join(script_dir, 'parcelles_consolidees.csv')
with open(output_path, mode='w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    
    en_tetes = [
        'id_parcel', 'surf_parc', 'code_cultu', 'libelle_culture', 'code_group', 'libelle_group', 'com_parc', 'pct_com', 'dep_parc', 'reg_parc', 
        'alt_mean', 'alt_min', 'alt_max', 'pente_mean', 'expo_mean', 'expo'
    ]
    writer.writerow(en_tetes)
    
    print("Écriture du CSV en cours...")
    lignes_ecrites = 0
    
    for row in cursor:
        # row[2] correspond à p.CODE_CULTU
        code_cultu = row[2]
        libelle_culture = cultures_dict.get(code_cultu, "")
        
        # row[3] correspond à p.CODE_GROUP
        code_group = row[3]
        libelle_group = group_dict.get(code_group, "")
        
        nouvelle_ligne = list(row[:3]) + [libelle_culture, code_group, libelle_group] + list(row[4:])
        writer.writerow(nouvelle_ligne)
        
        lignes_ecrites += 1
        if lignes_ecrites % 500000 == 0:
            print(f"{lignes_ecrites} parcelles traitées...")

conn.close()
print(f"\n{lignes_ecrites} parcelles exportées dans '{output_path}'.")