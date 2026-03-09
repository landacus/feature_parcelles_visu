import duckdb
import os

script_dir = os.path.dirname(os.path.abspath(__file__))

colonnes_a_verifier = [
    "reg_parc", 
    "dep_parc", 
    "com_parc", 
    "alt_mean", 
    "pente_mean", 
    "surf_parc"
]

conditions = " AND ".join([f"({col} IS NOT NULL AND {col} != 'NA' AND {col} != '')" for col in colonnes_a_verifier])

print("Nettoyage et conversion en cours")

duckdb.sql(f"""
    COPY (
        SELECT * FROM read_csv_auto('{script_dir}/parcelles_consolidees.csv', all_varchar=true)
        WHERE {conditions}
    ) 
    TO '{script_dir}/parcelles_nettoyees.csv' (FORMAT CSV, HEADER);
""")

print("Le fichier a été nettoyé.")