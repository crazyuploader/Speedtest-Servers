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
let currentSort = { column: null, direction: "asc" }; // Current sorting state

let map = null; // Leaflet map instance
let markers = L.markerClusterGroup(); // Layer group to hold markers (with clustering)

// Helper to show the spinner
function showSpinner() {
  spinner.classList.remove("hidden");
}

// Helper to hide the spinner
function hideSpinner() {
  spinner.classList.add("hidden");
}

// Helper to highlight search term in text
function highlightText(text, search) {
  if (!search) return text;
  const regex = new RegExp(`(${search})`, "gi");
  return text
    .toString()
    .replace(regex, '<mark class="bg-yellow-200">$1</mark>');
}

// Helper to convert slugified directory names to readable labels
// 'you-broadband-india' → 'You Broadband India'
const formatName = (str) =>
  str
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

// Function to populate the country filter dropdown based on all cached data
function populateGlobalCountryFilter() {
  const countries = new Set();
  // Iterate through all ISPs to collect all unique countries
  for (const dir in cachedData) {
    const data = cachedData[dir];
    if (data && data.servers) {
      data.servers.forEach((server) => {
        if (server.country) {
          countries.add(server.country);
        }
      });
    }
  }
  const sortedCountries = Array.from(countries).sort();

  const currentSelection = selectCountryFilter.value;
  selectCountryFilter.innerHTML = '<option value="">All Countries</option>';
  sortedCountries.forEach((country) => {
    const option = document.createElement("option");
    option.value = country;
    option.textContent = country;
    selectCountryFilter.appendChild(option);
  });
  // Restore current selection if it still exists
  if (sortedCountries.includes(currentSelection)) {
    selectCountryFilter.value = currentSelection;
  }
}

// Function to populate the ISP dropdown based on a country filter
function populateISPDropdown(country = "") {
  const options = [];
  for (const dir in cachedData) {
    const data = cachedData[dir];
    if (!data || !data.servers) continue;

    // If a country filter is provided, check if the ISP has servers in that country
    if (country) {
      const hasCountry = data.servers.some((s) => s.country === country);
      if (!hasCountry) continue;
    }

    const label = data.servers?.[0]?.sponsor || formatName(dir);
    options.push({ value: dir, label });
  }

  options.sort((a, b) => a.label.localeCompare(b.label));

  selectProvider.innerHTML = options
    .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
    .join("");

  return options;
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
  markers.clearLayers(); // Clear existing markers from cluster group

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
  showSpinner();
  try {
    const res = await fetch("data/isps.json");
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const dirs = await res.json();

    // Fetch all ISP data in parallel
    await Promise.all(
      dirs.map(async (dir) => {
        try {
          const jsonRes = await fetch(`data/${dir}/servers.json`);
          if (jsonRes.ok) {
            cachedData[dir] = await jsonRes.json();
          }
        } catch (err) {
          console.warn(`Failed to process data for ${dir}:`, err);
        }
      }),
    );

    populateGlobalCountryFilter();
    const ispOptions = populateISPDropdown();

    if (ispOptions.length > 0) {
      loadServers(ispOptions[0].value);
    } else {
      metadataDiv.innerHTML = `<p class="text-red-600">No ISP data available.</p>`;
      updateMapMarkers([]);
    }
  } catch (err) {
    console.error("Error loading providers:", err);
    metadataDiv.innerHTML = `<p class="text-red-600">Failed to load ISP list.</p>`;
  } finally {
    hideSpinner();
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

  // Apply sorting
  if (currentSort.column) {
    filteredServers.sort((a, b) => {
      let valA = a[currentSort.column] || "";
      let valB = b[currentSort.column] || "";

      // Handle numeric fields
      if (
        currentSort.column === "id" ||
        currentSort.column === "https_functional"
      ) {
        valA = parseFloat(valA);
        valB = parseFloat(valB);
      } else {
        valA = valA.toString().toLowerCase();
        valB = valB.toString().toLowerCase();
      }

      if (valA < valB) return currentSort.direction === "asc" ? -1 : 1;
      if (valA > valB) return currentSort.direction === "asc" ? 1 : -1;
      return 0;
    });
  }

  currentFilteredServers = filteredServers; // Store the filtered data for export
  updateMapMarkers(currentFilteredServers); // Update map with filtered servers

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

  // Calculate Enhanced Stats
  const ipv6Count = filteredServers.filter(
    (s) => s.ipv6_capable === "yes",
  ).length;
  const httpsCount = filteredServers.filter(
    (s) => s.https_functional === 1,
  ).length;
  const ipv6Percent = ((ipv6Count / filteredServers.length) * 100 || 0).toFixed(
    1,
  );
  const httpsPercent = (
    (httpsCount / filteredServers.length) * 100 || 0
  ).toFixed(1);

  // Show metadata with Enhanced Stats
  metadataDiv.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <p class="font-medium"><strong>Total Servers:</strong> <span class="font-bold text-blue-700">${filteredServers.length} / ${data.total_servers}</span></p>
      <p class="font-medium"><strong>Last Updated:</strong> <span class="font-bold text-blue-700">${formattedDate}</span></p>
      <p class="font-medium"><strong>IPv6 Ready:</strong> <span class="font-bold text-green-700">${ipv6Count} (${ipv6Percent}%)</span></p>
      <p class="font-medium"><strong>HTTPS Support:</strong> <span class="font-bold text-green-700">${httpsCount} (${httpsPercent}%)</span></p>
    </div>
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
          <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-800 sm:px-6 sm:py-4">${highlightText(server.name, searchTerm)}</td>
          <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-800 sm:px-6 sm:py-4">${highlightText(server.country, searchTerm)}</td>
          <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-800 sm:px-6 sm:py-4">${highlightText(server.sponsor, searchTerm)}</td>
          <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-800 sm:px-6 sm:py-4">${highlightText(server.id, searchTerm)}</td>
          <td class="px-4 py-2 whitespace-nowrap text-sm ${httpsClass} sm:px-6 sm:py-4">${server.https_functional === 1 ? "Yes" : "No"}</td>
          <td class="px-4 py-2 whitespace-nowrap text-sm ${ipv6Class} sm:px-6 sm:py-4">${server.ipv6_capable}</td>
          <td
              class="px-4 py-2 whitespace-nowrap text-sm text-gray-800 font-mono sm:px-6 sm:py-4 cursor-help relative"
              data-ipv4="${server.ip_address?.A || ""}"
              data-ipv6="${server.ip_address?.AAAA || ""}"
          >
              ${highlightText(server.hostname, searchTerm)}
          </td>
        </tr>`;
    });
  } else {
    // Colspan is now 8
    tbody.innerHTML = `<tr><td colspan="8" class="px-6 py-4 text-center text-gray-500 italic">No servers found matching your criteria.</td></tr>`;
  }

  // Update sort icons in the headers
  document.querySelectorAll("th[data-sort]").forEach((th) => {
    const icon = th.querySelector(".sort-icon");
    if (th.dataset.sort === currentSort.column) {
      icon.textContent = currentSort.direction === "asc" ? "▲" : "▼";
      icon.classList.add("text-blue-600");
    } else {
      icon.textContent = "⇅";
      icon.classList.remove("text-blue-600");
    }
  });
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
  // When ISP changes, reset search term but keep country filter, then load
  searchServersInput.value = "";
  applyFilters();
});

selectCountryFilter.addEventListener("change", () => {
  // When country changes, update the ISP list to only show relevant providers
  const selectedCountry = selectCountryFilter.value;
  const options = populateISPDropdown(selectedCountry);

  // If the currently selected ISP is not in the new filtered list, select the first one
  const currentIsp = selectProvider.value;
  const isCurrentIspValid = options.some((opt) => opt.value === currentIsp);

  if (!isCurrentIspValid && options.length > 0) {
    selectProvider.value = options[0].value;
  }

  applyFilters();
});

// Debounce function to limit how often a function is called
function debounce(func, delay) {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
}

searchServersInput.addEventListener("input", debounce(applyFilters, 300)); // Debounce search input by 300ms

// Event listeners for sorting
document.querySelectorAll("th[data-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    const column = th.dataset.sort;
    if (currentSort.column === column) {
      currentSort.direction = currentSort.direction === "asc" ? "desc" : "asc";
    } else {
      currentSort.column = column;
      currentSort.direction = "asc";
    }
    applyFilters();
  });
});

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
