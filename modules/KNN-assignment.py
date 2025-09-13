import json
import numpy as np
from sklearn.cluster import KMeans
import sys
import os
import matplotlib.pyplot as plt

# --- DATA LOADING AND PROCESSING FUNCTIONS (No changes here) ---

def load_perspectives_from_file(filename: str):
    """Loads the perspectives from a single, complete JSON file."""
    with open(filename, 'r', encoding='utf-8') as f:
        data = json.load(f)
        return data.get("input"), data.get("perspectives")

def reduce_perspectives_with_kmeans(perspectives: list, num_clusters: int):
    """Reduces a list of perspectives to a smaller, representative set using K-Means."""
    if len(perspectives) <= num_clusters:
        return perspectives
    coords = np.array([[p['bias_x'], p['significance_y']] for p in perspectives])
    kmeans = KMeans(n_clusters=num_clusters, random_state=42, n_init='auto')
    kmeans.fit(coords)
    representative_perspectives = []
    for i in range(num_clusters):
        cluster_center = kmeans.cluster_centers_[i]
        indices_in_cluster = np.where(kmeans.labels_ == i)[0]
        points_in_cluster = coords[indices_in_cluster]
        distances = np.linalg.norm(points_in_cluster - cluster_center, axis=1)
        closest_point_index_in_cluster = np.argmin(distances)
        original_index = indices_in_cluster[closest_point_index_in_cluster]
        representative_perspectives.append(perspectives[original_index])
    return representative_perspectives

def split_perspectives_by_bias(perspectives: list):
    """Splits a list of perspectives deterministically based on their 'bias_x' value."""
    leftist_perspectives, rightist_perspectives, common_perspectives = [], [], []
    LEFTIST_THRESHOLD, RIGHTIST_THRESHOLD = 0.143*3, 0.143*4
    for p in perspectives:
        bias = p.get('bias_x', 0.5)
        if bias < LEFTIST_THRESHOLD: leftist_perspectives.append(p)
        elif bias > RIGHTIST_THRESHOLD: rightist_perspectives.append(p)
        else: common_perspectives.append(p)
    return leftist_perspectives, rightist_perspectives, common_perspectives

# --- NEW OUTPUT AND VISUALIZATION FUNCTIONS ---

def save_agents_data(leftist_data, rightist_data, common_data, output_dir="."):
    """Saves the distributed perspectives to separate JSON files."""
    # The output files will be created inside the same directory as the script (modules/)
    with open(os.path.join(output_dir, 'leftist.json'), 'w', encoding='utf-8') as f:
        json.dump(leftist_data, f, indent=4)

    with open(os.path.join(output_dir, 'rightist.json'), 'w', encoding='utf-8') as f:
        json.dump(rightist_data, f, indent=4)

    with open(os.path.join(output_dir, 'common.json'), 'w', encoding='utf-8') as f:
        json.dump(common_data, f, indent=4)

def create_visualization(leftist_data, rightist_data, common_data, original_topic, output_dir="."):
    """Creates and saves a scatter plot visualizing the perspective distribution."""
    LEFTIST_THRESHOLD, RIGHTIST_THRESHOLD = 3*0.143, 4*0.143
    plt.style.use('seaborn-v0_8-darkgrid')
    fig, ax = plt.subplots(figsize=(15, 9))

    # Draw background zones for the political spectrum
    ax.axvspan(0, LEFTIST_THRESHOLD, facecolor='red', alpha=0.1, label='Leftist Zone')
    ax.axvspan(LEFTIST_THRESHOLD, RIGHTIST_THRESHOLD, facecolor='green', alpha=0.1, label='Common Zone')
    ax.axvspan(RIGHTIST_THRESHOLD, 1.0, facecolor='purple', alpha=0.1, label='Rightist Zone')

    # Plot the perspective points for each group
    if leftist_data:
        ax.scatter([p['bias_x'] for p in leftist_data], [p['significance_y'] for p in leftist_data],
                   color='#E63946', s=120, edgecolor='black', label='Leftist Perspectives', zorder=5)
    if common_data:
        ax.scatter([p['bias_x'] for p in common_data], [p['significance_y'] for p in common_data],
                   color='#588157', s=120, edgecolor='black', label='Common Perspectives', zorder=5)
    if rightist_data:
        ax.scatter([p['bias_x'] for p in rightist_data], [p['significance_y'] for p in rightist_data],
                   color='#6A057F', s=120, edgecolor='black', label='Rightist Perspectives', zorder=5)

    # Formatting the plot for clarity and aesthetics
    ax.set_title(f'Political Spectrum Visualization for:\n"{original_topic}"', fontsize=16, pad=20)
    ax.set_xlabel('Bias (Left < 0.36 | Center | Right > 0.64)', fontsize=12, labelpad=15)
    ax.set_ylabel('Significance', fontsize=12, labelpad=15)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1.1)
    ax.legend(loc='upper right', bbox_to_anchor=(1, 1.1))
    fig.tight_layout()
    
    # Save the plot to a file
    output_path = os.path.join(output_dir, 'debate_visualization.png')
    plt.savefig(output_path)


if __name__ == "__main__":
    # --- CONFIGURATION ---
    
    # This robustly finds the script's directory and the data file.
    script_dir = os.path.dirname(os.path.abspath(__file__))
    DATA_FILENAME = os.path.join(script_dir, "../output.json")
    
    # --- THIS IS THE CORRECTED LINE ---
    # This creates the path to '.../root/final_output'
    output_directory = os.path.join(script_dir, "../final_output")

    # This safely creates the directory if it doesn't already exist.
    os.makedirs(output_directory, exist_ok=True)
    
    NUM_CLUSTERS_TO_KEEP = 28

    # --- 1. LOAD DATA ---
    original_info, all_perspectives = load_perspectives_from_file(DATA_FILENAME)
    
    if not all_perspectives:
        sys.exit()

    
    # --- 2. OPTIONALLY REDUCE ---
    representative_set = reduce_perspectives_with_kmeans(all_perspectives, NUM_CLUSTERS_TO_KEEP)
    
    # --- 3. DISTRIBUTE BY BIAS ---
    leftist_args, rightist_args, shared_args = split_perspectives_by_bias(representative_set)

    # --- 4. DISPLAY IN TERMINAL ---

    # --- 5. SAVE TO FILES AND GENERATE GRAPH ---
    # These functions now use the corrected output directory path.
    save_agents_data(leftist_args, rightist_args, shared_args, output_dir=output_directory)
    create_visualization(leftist_args, rightist_args, shared_args, original_info, output_dir=output_directory)