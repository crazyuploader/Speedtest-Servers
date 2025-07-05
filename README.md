# Speedtest Server Data Collection

> This project automates the collection of publicly available Speedtest.net server data from various Internet Service Providers (ISPs). It provides a regularly updated repository of server details, including their locations and other configuration data, for network analysis and monitoring.

## About This Data

This repository contains JSON files, each dedicated to a specific ISP, holding a list of their Speedtest.net servers. The data is automatically fetched using the [Speedtest.net API](https://www.speedtest.net/about/knowledge/faq) and stored in a structured format for easy access and integration into other tools or scripts.

**Explore the Server Data:**

- [ACT Fibernet](data/act-fibernet/servers.json)
- [Asianet Broadband](data/asianet-broadband/servers.json)
- [Bharat Sanchar Nigam Ltd.](data/bharat-sanchar-nigam-ltd/servers.json)
- [Bharti Airtel Ltd.](data/bharti-airtel/servers.json)
- [Excitel](data/excitel/servers.json)
- [GTPL Broadband Pvt. Ltd.](data/gtpl-broadband-pvt-ltd/servers.json)
- [Hathway Cable](data/hathway/servers.json)
- [Ishan Netsol](data/ishan-netsol/servers.json)
- [Jio](data/jio/servers.json)
- [OneBroadband](data/onebroadband/servers.json)
- [RailTel Corporation of India Ltd.](data/railtel-corporation-of-india-ltd/servers.json)
- [Shyam Spectra](data/shyam-spectra/servers.json)
- [Siti Broadband](data/siti-broadband/servers.json)
- [Tata Play Fiber](data/tata-play-fiber/servers.json)
- [Tata Teleservices Ltd.](data/tata-teleservices-ltd/servers.json)
- [VI India](data/vi-india/servers.json)
- [YOU Broadband India Pvt. Ltd.](data/you-broadband-india/servers.json)

## How It Works

This project utilizes a Python script to query the Speedtest.net API for server information based on specified search terms (typically ISP names). Each query's results are then sanitized and saved as a `servers.json` file within a dedicated, named directory under the `data/` folder.

## Usage / Contributing

**To use this data:**
Simply click on any of the links above to view the raw JSON data for a specific ISP's Speedtest servers. You can also programmatically access these files for your own analyses.

**To update the data locally:**

1. Clone this repository: `git clone https://github.com/crazyuploader/Speedtest-Servers`
2. Navigate to the project directory: `cd Speedtest-Servers`
3. Install dependencies (if any, e.g., `uv sync`)
4. Run the main script: `python main.py -s "Bharti Airtel,Jio,ACT Fibernet"` (replace with desired ISPs)

## License

This project is open-source and available under the MIT License. See the `LICENSE` file for more details.
