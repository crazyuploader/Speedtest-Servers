const selectProvider = document.getElementById("provider"); // ISP dropdown element
const selectCountryFilter = document.getElementById("countryFilter"); // Country filter dropdown
const searchServersInput = document.getElementById("searchServers"); // Search input
const tbody = document.querySelector("tbody"); // table body where rows go
const metadataDiv = document.getElementById("metadata"); // metadata div
const spinner = document.getElementById("spinner"); // spinner element
const ipTooltip = document.getElementById("ip-tooltip"); // Tooltip element
const exportJsonButton = document.getElementById("exportJsonButton"); // Export JSON button
const mapDiv = document.getElementById("map"); // Map container element

// In-memory cache for already-fetched JSON data
const cachedData = {};
let currentISPData = null; // Stores the currently selected ISP's full data
let currentFilteredServers = []; // Stores the currently displayed (filtered) servers

let map = null; // Leaflet map instance
let markers = L.featureGroup(); // Layer group to hold markers

// Helper to show the spinner
function showSpinner() {
  spinner.classList.remove("hidden");
}

// Helper to hide the spinner
function hideSpinner() {
  spinner.classList.add("hidden");
}

// Helper to convert slugified directory names to readable labels
// 'you-broadband-india' → 'You Broadband India'
const formatName = (str) =>
  str
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

// Function to populate the country filter dropdown
function populateCountryFilter(servers) {
  const countries = new Set();
  servers.forEach((server) => {
    if (server.country) {
      countries.add(server.country);
    }
  });
  const sortedCountries = Array.from(countries).sort();

  selectCountryFilter.innerHTML = '<option value="">All Countries</option>';
  sortedCountries.forEach((country) => {
    const option = document.createElement("option");
    option.value = country;
    option.textContent = country;
    selectCountryFilter.appendChild(option);
  });
}

// Initialize the Leaflet map
function initializeMap() {
  if (map === null) {
    // Initialize map centered on a general location (e.g., world view)
    map = L.map("map").setView([20, 0], 2); // Centered at 20 Lat, 0 Lon, zoom level 2

    // Add OpenStreetMap tile layer
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Add the markers feature group to the map
    markers.addTo(map);
  }
}

// Update markers on the map based on filtered servers
function updateMapMarkers(servers) {
  markers.clearLayers(); // Clear existing markers

  const validMarkers = [];
  servers.forEach((server) => {
    // Check if latitude and longitude exist and are valid numbers
    if (
      server.lat &&
      server.lon &&
      !isNaN(parseFloat(server.lat)) &&
      !isNaN(parseFloat(server.lon))
    ) {
      const lat = parseFloat(server.lat);
      const lon = parseFloat(server.lon);

      const marker = L.marker([lat, lon]);
      marker.bindPopup(`
        <strong>${server.name}</strong><br>
        Sponsor: ${server.sponsor}<br>
        Host: ${server.hostname}<br>
        Country: ${server.country}<br>
        ID: ${server.id}
      `);
      markers.addLayer(marker);
      validMarkers.push(marker);
    }
  });

  // Fit map bounds to all markers if there are any
  if (validMarkers.length > 0) {
    const bounds = new L.LatLngBounds(
      validMarkers.map((marker) => marker.getLatLng()),
    );
    map.fitBounds(bounds, { padding: [50, 50] }); // Add some padding
  } else {
    // If no markers, reset view to a default world view
    map.setView([20, 0], 2);
  }
}

// Load all ISPs listed from the server
async function loadProviders() {
  showSpinner(); // Show spinner before starting to fetch data
  try {
    const res = await fetch("/list");
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const dirs = await res.json(); // array of directory names like 'jio', 'hathway'
    const options = [];

    // For each ISP directory, fetch the servers.json file
    for (const dir of dirs) {
      try {
        const jsonRes = await fetch(`/data/${dir}/servers.json`);
        if (!jsonRes.ok) {
          console.warn(
            `Failed to fetch data for ${dir}: HTTP error! status: ${jsonRes.status}`,
          );
          continue; // Skip to the next directory
        }
        const data = await jsonRes.json();

        // Cache this JSON for later use (avoids re-fetching)
        cachedData[dir] = data;

        // Label for dropdown: use sponsor name or fallback to formatted dir name
        const label = data.servers?.[0]?.sponsor || formatName(dir);
        options.push({ value: dir, label });
      } catch (err) {
        console.warn(`Failed to process data for ${dir}:`, err);
      }
    }

    // Sort ISPs alphabetically by sponsor name
    options.sort((a, b) => a.label.localeCompare(b.label));

    // Render dropdown options
    selectProvider.innerHTML = options
      .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
      .join("");

    // Load the first ISP by default
    if (options.length > 0) {
      // Reset filters when a new ISP is loaded
      selectCountryFilter.value = "";
      searchServersInput.value = "";
      loadServers(options[0].value);
    } else {
      metadataDiv.innerHTML = `<p class="text-red-600">No ISP data available.</p>`;
      updateMapMarkers([]); // Clear map if no data
    }
  } catch (err) {
    console.error("Error loading providers:", err);
    metadataDiv.innerHTML = `<p class="text-red-600">Failed to load ISP list. Please check the server connection.</p>`;
    updateMapMarkers([]); // Clear map on error
  } finally {
    hideSpinner(); // Hide spinner after all data is fetched or an error occurs
  }
}

// Load server data from cachedData, apply filters, and display it in the table
function loadServers(isp, countryFilter = "", searchTerm = "") {
  const data = cachedData[isp];
  currentISPData = data; // Store the full data for current ISP

  if (!data || !data.servers) {
    // Colspan is now 8
    tbody.innerHTML = `<tr><td colspan="8" class="px-6 py-4 text-center text-gray-500">No server data found for this ISP.</td></tr>`;
    metadataDiv.innerHTML = `<p class="text-red-600">No data available for the selected ISP.</p>`;
    populateCountryFilter([]); // Clear country filter
    currentFilteredServers = []; // Clear filtered servers
    updateMapMarkers([]); // Clear map markers
    return;
  }

  let filteredServers = data.servers; // No simulation needed if columns are removed

  // Apply country filter
  if (countryFilter) {
    filteredServers = filteredServers.filter(
      (server) => server.country === countryFilter,
    );
  }

  // Apply search term filter
  if (searchTerm) {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    filteredServers = filteredServers.filter(
      (server) =>
        server.name.toLowerCase().includes(lowerCaseSearchTerm) ||
        server.sponsor.toLowerCase().includes(lowerCaseSearchTerm) ||
        server.host.toLowerCase().includes(lowerCaseSearchTerm) ||
        server.id.includes(lowerCaseSearchTerm) ||
        server.country.toLowerCase().includes(lowerCaseSearchTerm) ||
        server.cc.toLowerCase().includes(lowerCaseSearchTerm),
    );
  }

  currentFilteredServers = filteredServers; // Store the filtered data for export
  updateMapMarkers(currentFilteredServers); // Update map with filtered servers

  // Populate country filter based on the *original* full data for the ISP
  populateCountryFilter(data.servers);
  // Ensure the selected country filter remains active
  selectCountryFilter.value = countryFilter;

  // Format last updated timestamp (24-hour format)
  const updatedAt = new Date(data.updated_at);
  const formattedDate = updatedAt.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false, // 24-hour clock
  });

  // Live status counts are no longer relevant without the 'Status' column
  // but keeping the metadata structure consistent for now.
  // If you want to completely remove this, you can adjust the metadataDiv.innerHTML
  // const onlineServers = filteredServers.filter(s => s.simulatedStatus === 'Online').length;
  // const offlineServers = filteredServers.length - onlineServers;

  // Show metadata
  metadataDiv.innerHTML = `
    <p class="font-medium"><strong>Total Servers:</strong> <span class="font-bold text-blue-700">${data.total_servers}</span></p>
    <p class="font-medium"><strong>Last Updated:</strong> <span class="font-bold text-blue-700">${formattedDate}</span></p>
    <!-- Removed live status as columns are removed -->
  `;

  // Populate table rows with server data
  tbody.innerHTML = "";
  if (filteredServers.length > 0) {
    filteredServers.forEach((server, idx) => {
      const ipv6Class =
        server.ipv6_capable === "yes"
          ? "text-green-600 font-semibold"
          : "text-red-600 font-semibold";
      const httpsClass =
        server.https_functional === 1
          ? "text-green-600 font-semibold"
          : "text-red-600 font-semibold";

      tbody.innerHTML += `
        <tr class="${idx % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-blue-50 transition duration-150 ease-in-out">
          <td class="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-800 sm:px-6 sm:py-4">${idx + 1}</td>
          <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-800 sm:px-6 sm:py-4">${server.name}</td>
          <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-800 sm:px-6 sm:py-4">${server.country}</td>
          <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-800 sm:px-6 sm:py-4">${server.sponsor}</td>
          <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-800 sm:px-6 sm:py-4">${server.id}</td>
          <td class="px-4 py-2 whitespace-nowrap text-sm ${httpsClass} sm:px-6 sm:py-4">${server.https_functional === 1 ? "Yes" : "No"}</td>
          <td class="px-4 py-2 whitespace-nowrap text-sm ${ipv6Class} sm:px-6 sm:py-4">${server.ipv6_capable}</td>
          <td
              class="px-4 py-2 whitespace-nowrap text-sm text-gray-800 font-mono sm:px-6 sm:py-4 cursor-help relative"
              data-ipv4="${server.ip_address?.A || ""}"
              data-ipv6="${server.ip_address?.AAAA || ""}"
          >
              ${server.hostname}
          </td>
        </tr>`;
    });
  } else {
    // Colspan is now 8
    tbody.innerHTML = `<tr><td colspan="8" class="px-6 py-4 text-center text-gray-500 italic">No servers found matching your criteria.</td></tr>`;
  }
}

// Function to trigger re-rendering with current filters
function applyFilters() {
  const selectedIsp = selectProvider.value;
  const selectedCountry = selectCountryFilter.value;
  const searchTerm = searchServersInput.value;
  loadServers(selectedIsp, selectedCountry, searchTerm);
}

// Function to export current filtered data to JSON
function exportToJson() {
  if (currentFilteredServers.length === 0) {
    // Using a simple alert for now, consider a custom modal for better UX
    alert("No servers to export. Please apply filters or select an ISP.");
    return;
  }

  const jsonString = JSON.stringify(currentFilteredServers, null, 2); // Pretty print JSON
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `speedtest_servers_${selectProvider.value}_${new Date().toISOString().slice(0, 10)}.json`; // Dynamic filename
  document.body.appendChild(a); // Append to body to make it clickable
  a.click(); // Programmatically click the link to trigger download
  document.body.removeChild(a); // Clean up the temporary link
  URL.revokeObjectURL(url); // Release the object URL
}

// Event listeners for filters
selectProvider.addEventListener("change", () => {
  // When ISP changes, reset country filter and search term, then load
  selectCountryFilter.value = "";
  searchServersInput.value = "";
  applyFilters();
});
selectCountryFilter.addEventListener("change", applyFilters);
// Debounce function to limit how often a function is called
function debounce(func, delay) {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
}

// Event listeners for filters
selectProvider.addEventListener("change", () => {
  // When ISP changes, reset country filter and search term, then load
  selectCountryFilter.value = "";
  searchServersInput.value = "";
  applyFilters();
});
selectCountryFilter.addEventListener("change", applyFilters);
searchServersInput.addEventListener("input", debounce(applyFilters, 300)); // Debounce search input by 300ms

// Event listener for export button
exportJsonButton.addEventListener("click", exportToJson);

// --- Tooltip Event Listeners ---
tbody.addEventListener("mouseover", (e) => {
  const hoveredCell = e.target.closest("td");

  // Ensure the hovered element is the last column (Host) and contains IP data
  // The index is now 7 (0-indexed), as 4 columns were removed from the original 11th index.
  if (
    hoveredCell &&
    hoveredCell.cellIndex === 7 &&
    hoveredCell.hasAttribute("data-ipv4")
  ) {
    const ipv4 = hoveredCell.dataset.ipv4;
    const ipv6 = hoveredCell.dataset.ipv6;

    let tooltipContent = `<p><strong>IPv4:</strong> ${ipv4 || "N/A"}</p>`;
    if (ipv6) {
      tooltipContent += `<p><strong>IPv6:</strong> ${ipv6}</p>`;
    }
    ipTooltip.innerHTML = tooltipContent;

    // Position the tooltip relative to the hovered cell
    const rect = hoveredCell.getBoundingClientRect();
    const tooltipWidth = ipTooltip.offsetWidth;
    const tooltipHeight = ipTooltip.offsetHeight;

    // Calculate position relative to the document
    let top = rect.bottom + window.scrollY + 10; // 10px below the cell
    let left = rect.left + window.scrollX;

    // Adjust if too close to the right edge of the viewport
    if (left + tooltipWidth > window.innerWidth - 20) {
      left = window.innerWidth - tooltipWidth - 20; // 20px padding from right
    }
    // Ensure it doesn't go off the left edge of the viewport
    if (left < 10) {
      left = 10;
    }

    ipTooltip.style.top = `${top}px`;
    ipTooltip.style.left = `${left}px`;
    ipTooltip.classList.add("visible");
  }
});

tbody.addEventListener("mouseout", (e) => {
  // Hide the tooltip when the mouse leaves the tbody area
  ipTooltip.classList.remove("visible");
});

// Dark mode toggle logic
const darkModeToggle = document.getElementById("darkModeToggle");
const darkModeIcon = document.getElementById("darkModeIcon");
const prefersDark =
  window.matchMedia &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

function setDarkMode(enabled) {
  if (enabled) {
    document.body.classList.add("dark-mode");
    darkModeIcon.textContent = "☀️";
  } else {
    document.body.classList.remove("dark-mode");
    darkModeIcon.textContent = "🌙";
  }
}

// Start everything when page loads
document.addEventListener("DOMContentLoaded", () => {
  // Initialize dark mode
  let dark = localStorage.getItem("darkMode");
  if (dark === null) {
    dark = prefersDark ? "true" : "false";
  }
  setDarkMode(dark === "true");

  // Initialize map and load providers
  initializeMap(); // Initialize the map first
  loadProviders(); // Then load providers and populate data

  // Return current year
  const yearSpan = document.getElementById("year");
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }
});

// Toggle dark mode on button click
darkModeToggle.addEventListener("click", () => {
  const isDark = document.body.classList.toggle("dark-mode");
  setDarkMode(isDark);
  localStorage.setItem("darkMode", isDark ? "true" : "false");
});
