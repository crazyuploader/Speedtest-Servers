const selectProvider = document.getElementById("provider");
const selectCountryFilter = document.getElementById("countryFilter");
const searchServersInput = document.getElementById("searchServers");
const tbody = document.querySelector("tbody");
const metadataDiv = document.getElementById("metadata");
const spinner = document.getElementById("spinner");
const ipTooltip = document.getElementById("ip-tooltip");
const exportJsonButton = document.getElementById("exportJsonButton");
const mapDiv = document.getElementById("map");

const cachedData = {};
let currentISPData = null;
let currentFilteredServers = [];
let currentSort = { column: null, direction: "asc" };

let map = null;
let tileLayer = null;
let markers = null;

function showSpinner() {
  spinner.classList.remove("hidden");
}

function hideSpinner() {
  spinner.classList.add("hidden");
}

function highlightText(text, search) {
  if (!search) return text;
  const regex = new RegExp(`(${search})`, "gi");
  return text.toString().replace(regex, "<mark>$1</mark>");
}

const formatName = (str) =>
  str
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

function getCommonSponsorPrefix(sponsors) {
  if (!sponsors || sponsors.length === 0) return "";
  if (sponsors.length === 1) return sponsors[0];
  const validSponsors = sponsors.filter((s) => s && s.trim().length > 0);
  if (validSponsors.length === 0) return "";
  if (validSponsors.length === 1) return validSponsors[0];
  const sorted = [...validSponsors].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  let i = 0;
  while (i < first.length && first[i] === last[i]) {
    i++;
  }
  let prefix = first.substring(0, i).trim();
  return prefix.length > 2 ? prefix : null;
}

function populateGlobalCountryFilter() {
  const countries = new Set();
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
  if (sortedCountries.includes(currentSelection)) {
    selectCountryFilter.value = currentSelection;
  }
}

function populateISPDropdown(country = "") {
  const options = [];
  for (const dir in cachedData) {
    const data = cachedData[dir];
    if (!data || !data.servers) continue;
    let relevantServers = data.servers;
    if (country) {
      relevantServers = data.servers.filter((s) => s.country === country);
      if (relevantServers.length === 0) continue;
    }
    const sponsors = Array.from(new Set(relevantServers.map((s) => s.sponsor)));
    let label = null;
    if (sponsors.length === 1) {
      label = sponsors[0];
    } else {
      const commonPrefix = getCommonSponsorPrefix(sponsors);
      if (commonPrefix) {
        label = commonPrefix;
      }
    }
    if (!label) {
      label = formatName(dir);
    }
    options.push({ value: dir, label });
  }
  options.sort((a, b) => a.label.localeCompare(b.label));
  selectProvider.innerHTML = options
    .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
    .join("");
  return options;
}

function getTileLayer() {
  const isDark = !document.body.classList.contains("light-mode");
  return isDark
    ? {
        url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      }
    : {
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      };
}

function initializeMap() {
  if (map === null) {
    map = L.map("map").setView([20, 0], 2);
    const cfg = getTileLayer();
    tileLayer = L.tileLayer(cfg.url, { attribution: cfg.attr }).addTo(map);
    markers = L.markerClusterGroup();
    markers.addTo(map);
  }
}

function updateMapMarkers(servers) {
  markers.clearLayers();
  const validMarkers = [];
  servers.forEach((server) => {
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
  if (validMarkers.length > 0) {
    const bounds = new L.LatLngBounds(
      validMarkers.map((marker) => marker.getLatLng()),
    );
    map.fitBounds(bounds, { padding: [50, 50] });
  } else {
    map.setView([20, 0], 2);
  }
}

async function loadProviders() {
  showSpinner();
  try {
    const res = await fetch("data/isps.json");
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const dirs = await res.json();
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
      metadataDiv.innerHTML = `<p style="color: var(--accent-red); font-size: 0.9rem;">No ISP data available.</p>`;
      updateMapMarkers([]);
    }
  } catch (err) {
    console.error("Error loading providers:", err);
    metadataDiv.innerHTML = `<p style="color: var(--accent-red); font-size: 0.9rem;">Failed to load ISP list.</p>`;
  } finally {
    hideSpinner();
  }
}

function loadServers(isp, countryFilter = "", searchTerm = "") {
  const data = cachedData[isp];
  currentISPData = data;
  if (!data || !data.servers) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px 16px;color:var(--text-muted);">No server data found for this ISP.</td></tr>`;
    metadataDiv.innerHTML = `<p style="color: var(--accent-red); font-size: 0.9rem;">No data available for the selected ISP.</p>`;
    document.getElementById("serverCountBadge").textContent = "0 servers";
    currentFilteredServers = [];
    updateMapMarkers([]);
    return;
  }
  let filteredServers = data.servers;
  if (countryFilter) {
    filteredServers = filteredServers.filter(
      (server) => server.country === countryFilter,
    );
  }
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
  if (currentSort.column) {
    filteredServers.sort((a, b) => {
      let valA = a[currentSort.column] || "";
      let valB = b[currentSort.column] || "";
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
  currentFilteredServers = filteredServers;
  updateMapMarkers(currentFilteredServers);
  document.getElementById("serverCountBadge").textContent =
    `${filteredServers.length} servers`;
  const updatedAt = new Date(data.updated_at);
  const formattedDate = updatedAt.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
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
  metadataDiv.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon cyan">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
        </svg>
      </div>
      <div class="stat-body">
        <p class="stat-label">Total Servers</p>
        <p class="stat-value">${filteredServers.length} <span class="stat-sub">/ ${data.total_servers}</span></p>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon emerald">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      </div>
      <div class="stat-body">
        <p class="stat-label">IPv6 Ready</p>
        <p class="stat-value">${ipv6Count} <span class="stat-sub">(${ipv6Percent}%)</span></p>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon amber">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      </div>
      <div class="stat-body">
        <p class="stat-label">HTTPS Support</p>
        <p class="stat-value">${httpsCount} <span class="stat-sub">(${httpsPercent}%)</span></p>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon purple">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
      </div>
      <div class="stat-body">
        <p class="stat-label">Last Updated</p>
        <p class="stat-value stat-date">${formattedDate}</p>
      </div>
    </div>
  `;
  tbody.innerHTML = "";
  if (filteredServers.length > 0) {
    filteredServers.forEach((server, idx) => {
      const ipv6Class = server.ipv6_capable === "yes" ? "cell-yes" : "cell-no";
      const httpsClass = server.https_functional === 1 ? "cell-yes" : "cell-no";
      tbody.innerHTML += `
        <tr>
          <td class="cell-mono" style="color:var(--text-muted)">${idx + 1}</td>
          <td>${highlightText(server.name, searchTerm)}</td>
          <td>${highlightText(server.country, searchTerm)}</td>
          <td>${highlightText(server.sponsor, searchTerm)}</td>
          <td class="cell-mono">${server.id}</td>
          <td class="${httpsClass}">${server.https_functional === 1 ? "Yes" : "No"}</td>
          <td class="${ipv6Class}">${server.ipv6_capable}</td>
          <td class="cell-host cell-mono"
              data-ipv4="${server.ip_address?.A || ""}"
              data-ipv6="${server.ip_address?.AAAA || ""}">
              ${highlightText(server.hostname, searchTerm)}
          </td>
        </tr>`;
    });
  } else {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px 16px;color:var(--text-muted);font-style:italic;">No servers found matching your criteria.</td></tr>`;
  }
  document.querySelectorAll("th[data-sort]").forEach((th) => {
    const icon = th.querySelector(".sort-icon");
    if (th.dataset.sort === currentSort.column) {
      icon.textContent = currentSort.direction === "asc" ? "▲" : "▼";
      icon.classList.add("active");
    } else {
      icon.textContent = "⇅";
      icon.classList.remove("active");
    }
  });
}

function applyFilters() {
  const selectedIsp = selectProvider.value;
  const selectedCountry = selectCountryFilter.value;
  const searchTerm = searchServersInput.value;
  loadServers(selectedIsp, selectedCountry, searchTerm);
}

function exportToJson() {
  if (currentFilteredServers.length === 0) {
    alert("No servers to export. Please apply filters or select an ISP.");
    return;
  }
  const jsonString = JSON.stringify(currentFilteredServers, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `speedtest_servers_${selectProvider.value}_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

selectProvider.addEventListener("change", () => {
  searchServersInput.value = "";
  applyFilters();
});

selectCountryFilter.addEventListener("change", () => {
  const selectedCountry = selectCountryFilter.value;
  const options = populateISPDropdown(selectedCountry);
  const currentIsp = selectProvider.value;
  const isCurrentIspValid = options.some((opt) => opt.value === currentIsp);
  if (!isCurrentIspValid && options.length > 0) {
    selectProvider.value = options[0].value;
  }
  applyFilters();
});

function debounce(func, delay) {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
}

searchServersInput.addEventListener("input", debounce(applyFilters, 300));

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

exportJsonButton.addEventListener("click", exportToJson);

tbody.addEventListener("mouseover", (e) => {
  const hoveredCell = e.target.closest("td");
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
    const rect = hoveredCell.getBoundingClientRect();
    const tooltipWidth = ipTooltip.offsetWidth;
    let top = rect.bottom + window.scrollY + 10;
    let left = rect.left + window.scrollX;
    if (left + tooltipWidth > window.innerWidth - 20) {
      left = window.innerWidth - tooltipWidth - 20;
    }
    if (left < 10) {
      left = 10;
    }
    ipTooltip.style.top = `${top}px`;
    ipTooltip.style.left = `${left}px`;
    ipTooltip.classList.add("visible");
  }
});

tbody.addEventListener("mouseout", () => {
  ipTooltip.classList.remove("visible");
});

const darkModeToggle = document.getElementById("darkModeToggle");
const prefersDark =
  window.matchMedia &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

function setDarkMode(enabled) {
  if (enabled) {
    document.body.classList.remove("light-mode");
  } else {
    document.body.classList.add("light-mode");
  }
  if (map && tileLayer) {
    map.removeLayer(tileLayer);
    const cfg = getTileLayer();
    tileLayer = L.tileLayer(cfg.url, { attribution: cfg.attr }).addTo(map);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  let dark = localStorage.getItem("darkMode");
  if (dark === null) {
    dark = prefersDark ? "true" : "false";
  }
  setDarkMode(dark === "true");
  initializeMap();
  loadProviders();
  const yearSpan = document.getElementById("year");
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }
});

darkModeToggle.addEventListener("click", () => {
  const currentlyDark = !document.body.classList.contains("light-mode");
  setDarkMode(!currentlyDark);
  localStorage.setItem("darkMode", (!currentlyDark).toString());
});
