import duckdb
import os

script_dir = os.path.dirname(os.path.abspath(__file__))

print("Démarrage de la conversion")

csv_path = os.path.join(script_dir, 'parcelles_nettoyees.csv')
parquet_path = os.path.join(script_dir, 'parcelles.parquet')

duckdb.sql(f"""
    COPY (
        SELECT * FROM read_csv_auto('{csv_path}', all_varchar=true)
    ) 
    TO '{parquet_path}' 
    (FORMAT PARQUET, COMPRESSION 'ZSTD');
""")

print(f"Le fichier {parquet_path} est prêt.")