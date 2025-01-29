const mapCenter = [47.5615, -52.7126];
const map = L.map('map').setView(mapCenter, 13);
let countdownTimer;
let timeRemaining = 300;

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const busMarkers = {};
const busNumbers = {};
const busNumbersSet = new Set();
const highlightedMarker = new Set();
let currentBusIndex = {};

async function getBusData() {
    const url = "https://www.metrobus.co.ca/api/timetrack/json/";
    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
            }
        });
        const busData = await response.json();
        return busData;
    } catch (e) {
        console.error("Error fetching bus data:", e);
        return [];
    }
}

function updateTimer() {
    const timerElement = document.getElementById('timerOverlay');
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    timerElement.textContent = `Updating in ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function updateLocalTime() {
    try {
        const response = await fetch("https://www.timeapi.io/api/Time/current/zone?timeZone=America/St_Johns");
        const data = await response.json();
        const { hour, minute } = data;
        let ampm = hour >= 12 ? "PM" : "AM";
        let hours = hour % 12 || 12;
        let minutes = minute < 10 ? "0" + minute : minute;
        const formattedTime = `${hours}:${minutes} ${ampm}`;
        document.getElementById("localTimeOverlay").textContent = formattedTime;

        if (hour >= 0 && hour < 6) {
            document.getElementById("timerOverlay").textContent = "⚠️ no Metrobus service";
        } 
    } catch (error) {
        console.error("Error fetching local time:", error);
    }
}


function resetTimer() {
    clearInterval(countdownTimer);
    timeRemaining = 300;
    updateTimer();
    countdownTimer = setInterval(() => {
        if (timeRemaining > 0) {
            timeRemaining--;
            updateTimer();
        } else {
            clearInterval(countdownTimer);
        }
    }, 1000);
}

function resetMarkerStyle(marker, originalIcon) {
    marker.setIcon(originalIcon);
}

function highlightMarker(marker) {
    // Set the new icon for highlighting
    const highlightedIcon = L.divIcon({
        className: 'leaflet-div-icon bounce',
        html: `<div style="position: relative; display: flex; justify-content: center; align-items: center; animation: bounce 1s infinite;">
            <i class="fa-solid fa-location-pin" style="font-size: 60px; color: #FF0000; position: absolute; bottom: 0px;"></i>
            <div class="bus-route" style="position: absolute; bottom: 15px; left: 50%; transform: translateX(-50%); color: white; background-color: rgba(0, 0, 0, 0.8); padding: 3px 6px; border-radius: 5px; font-size: 14px; font-weight: bold;">
                ${marker.routeNumber}
            </div>
        </div>`
    });

    marker.setIcon(highlightedIcon);

    setTimeout(() => resetMarkerStyle(marker, marker.originalIcon), 2000);
}

async function updateMap() {
    const buses = await getBusData();
    const rawDataContainer = document.getElementById('rawData');
    const busNumbersContainer = document.getElementById('busNumbers');
    rawDataContainer.innerHTML = ""; // Clear previous data

    Object.values(busMarkers).forEach(markers => markers.forEach(marker => marker.remove()));
    Object.keys(busMarkers).forEach(key => delete busMarkers[key]);

    buses.forEach(bus => {
        const route = bus.current_route || "Unknown";
        const lat = parseFloat(bus.bus_lat);
        const lon = parseFloat(bus.bus_lon);
        const currentLocation = bus.current_location || "Unknown";
        const positionTime = bus.position_time || "Unknown";
        const deviation = bus.deviation || "Unknown";

        const routeNumber = route.split('-')[0];
        const icon = L.divIcon({
            className: 'leaflet-div-icon',
            html: `<div style="position: relative; display: flex; justify-content: center; align-items: center;">
                <i class="fa-solid fa-location-pin" style="font-size: 40px; color: #007900; position: absolute; bottom: 0px;"></i>
                <div class="bus-route" style="position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); color: white; background-color: rgba(0, 0, 0, 0.07); padding: 3px 6px; border-radius: 5px; font-size: 12px; font-weight: bold;">
                    ${routeNumber}
                </div>
            </div>`
        });

        const marker = L.marker([lat, lon], { icon }).addTo(map)
            .bindPopup(`
                <strong>Route: ${route}</strong><br>
                Location: ${currentLocation}<br>
                Last Updated: ${positionTime}<br>
                Status: ${deviation}
            `);

        marker.routeNumber = routeNumber;
        marker.originalIcon = icon;

        if (!busMarkers[routeNumber]) {
            busMarkers[routeNumber] = [];
        }
        busMarkers[routeNumber].push(marker);

        if (!currentBusIndex[routeNumber]) {
            currentBusIndex[routeNumber] = 0;
        }

        // Add bus data to raw data panel
        const rawDataItem = document.createElement('div');
        rawDataItem.className = 'raw-data-item';
        rawDataItem.innerHTML = `
            <strong>Bus ${routeNumber}</strong><br>
            Route: ${route}<br>
            Location: ${currentLocation}<br>
            Last Updated: ${positionTime}<br>
            Status: ${deviation}<br>
            <hr>
        `;
        rawDataContainer.appendChild(rawDataItem);

        // Add bus number button if it doesn't exist
        if (!busNumbersSet.has(routeNumber)) {
            busNumbersSet.add(routeNumber);

            const busNumberButton = document.createElement('div');
            busNumberButton.className = 'bus-number';
            busNumberButton.textContent = routeNumber;

            busNumberButton.onclick = function () {
                const markers = busMarkers[routeNumber];
                const index = currentBusIndex[routeNumber];
                const marker = markers[index];

                map.setView(marker.getLatLng(), 14);
                highlightMarker(marker);

                // Cycle to the next bus
                currentBusIndex[routeNumber] = (index + 1) % markers.length;
            };

            busNumbersContainer.appendChild(busNumberButton);
        }
    });

    resetTimer();
}

document.querySelector('.accordion').addEventListener('click', function() {
    this.classList.toggle('active');
    const panel = document.getElementById('rawData');
    panel.style.display = panel.style.display === "block" ? "none" : "block";
});

function toggleBusNumbers() {
    const busNumbersContainer = document.getElementById('busNumbers');
    busNumbersContainer.style.display = busNumbersContainer.style.display === 'flex' ? 'none' : 'flex';
}

function handleRefresh() {
    updateMap();
    resetTimer();
}

setInterval(updateLocalTime, 1000);
setInterval(updateMap, 300000);
updateMap();
updateLocalTime();
