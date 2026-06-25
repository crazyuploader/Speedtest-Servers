# Speedtest Server Data Collection

> This project automates the collection of publicly available Speedtest.net server data from various Internet Service Providers (ISPs). It provides a regularly updated repository of server details, including their locations and other configuration data, for network analysis and monitoring.

## Dashboard

The project includes a **static web dashboard** to explore and visualize the collected server data on an interactive map.

- **Live:** [https://speedtest-servers.devjugal.com/](https://speedtest-servers.devjugal.com/)
- **Status:** Hosted on Netlify (Static Site)

## About This Data

This repository contains JSON files, each dedicated to a specific ISP, holding a list of their Speedtest.net servers. The data is automatically fetched using the [Speedtest.net API](https://www.speedtest.net/about/knowledge/faq) and stored in a structured format for easy access and integration into other tools or scripts.

**Explore the Server Data:**

See the auto-generated index in [`SERVER_DATA.md`](SERVER_DATA.md).

## How It Works

This project utilizes a Python script to query the Speedtest.net API for server information based on specified search terms (typically ISP names). Each query's results are then sanitized and saved as a `servers.json` file within a dedicated, named directory under the `data/` folder.

## Usage

**To use this data:**
Simply click on any of the links above to view the raw JSON data for a specific ISP's Speedtest servers. You can also programmatically access these files for your own analyses.

**To update the data locally:**

1. Clone this repository: `git clone https://github.com/crazyuploader/Speedtest-Servers.git`
2. Navigate to the project directory: `cd Speedtest-Servers`
3. Install dependencies using `uv`:
   ```bash
   uv sync
   ```
4. Run the main script to fetch data:
   ```bash
   python main.py --search "Bharti Airtel,Jio,ACT Fibernet"
   ```
   (Replace `"Bharti Airtel,Jio,ACT Fibernet"` with your desired comma-separated ISP search strings.)

## License

This project is open-source and available under the MIT License. See the [`LICENSE`](LICENSE) file for more details.
