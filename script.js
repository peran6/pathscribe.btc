
var map = L.map('map', {
    minZoom: 3,
    maxZoom: 18,
    worldCopyJump: false,
    maxBounds: [[-90, -180], [90, 180]],
    maxBoundsViscosity: 1.0
}).setView([0, 0], 2);
var coordinates = {
    "coordinates": []
};
var tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: "Map data © <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
});
var tileLayerEnabled = true;
var markers = [];
var importedPolylines = [];
var geojsonLayer;
var pathScribeMode = false;
var addPathMode = false;
var pathStartMarker;
var pathEndMarker;
var pathPolyline;
var pathCoordinates = [];
var selectedChartIndex = null;
var lastBlockHeight = null;
var lastDotInfo = null;
var darknessTimerInterval;
var darknessSeconds = 0;
var timePassedInterval;
var firstCoordinateAdded = false;  // Track if the first coordinate has been added
var domainMetadata = [];
var hexagonData = [];
var imageOverlay;
var imageBounds = [[40.355345, -3.687194], [43.476917, 1.4426]]; // Default bounds for initial loading
var editingBoundary = null; // Track which boundary is being edited
var swMarker, neMarker; // Markers for boundaries

var dotObjects = [];
var profileImageMarker;
var profileLocationMarker;
var greyDotMarker; // New grey dot marker
let locationSelectMode = false;

let profileMarkers = []; // Array to store created markers
var popup = L.popup(); // Define the popup globally
var radarChartMap;

//Elements Start
const copyButtons = document.querySelectorAll('.copyButton');
const toggleTileLayerButton = document.getElementById('toggleTileLayerButton');
const imageInput = document.getElementById('imageInput');
const removeMapButton = document.getElementById('removeMapButton');
const mapBoundsControls = document.getElementById('mapBoundsControls');
const searchInput = document.getElementById('searchInput');
const canvas = document.getElementById('radarChart');
//Elements End

//Functionalities Start
async function setup() {
    tileLayer.addTo(map);
    document.getElementById('toggleTileLayerButton').textContent = 'Disable Tile Layer';

    const bitmapNumber = 114588;
    searchInput.value = bitmapNumber;
    await fetchPathscribers(114588);

    createRadarChart("Map" ,[],domainMetadata.hexagon);

    await initializeYellowDot();
    setInterval(checkForNewBlock, 30000); // Check for new block every 30 seconds
}

copyButtons.forEach(button => {
    button.addEventListener('click', function() {
        const copyText = button.previousElementSibling; // Get the previous input sibling
        copyText.select();
        copyText.setSelectionRange(0, 99999); // For mobile devices
        navigator.clipboard.writeText(copyText.value)
            .then(() => {
                alert("Copied to clipboard: " + copyText.value);
            })
            .catch(err => {
                console.error("Failed to copy: ", err);
            });
    });
});

toggleTileLayerButton.addEventListener('click', function() {
    if (tileLayerEnabled) {
        map.removeLayer(tileLayer);
        tileLayerEnabled = false;
        toggleTileLayerButton.textContent = 'Enable Tile Layer';
    } else {
        tileLayer.addTo(map);
        tileLayerEnabled = true;
        toggleTileLayerButton.textContent = 'Disable Tile Layer';
    }
});

document.getElementById('geojsonInput').addEventListener('change', function(event) {
    var file = event.target.files[0];
    var reader = new FileReader();

    reader.onload = function(e) {
        var data = JSON.parse(e.target.result);
        if (geojsonLayer) {
            map.removeLayer(geojsonLayer);
        }
        geojsonLayer = L.geoJSON(data).addTo(map);
        map.fitBounds(geojsonLayer.getBounds());

        // Center map to geoJSON layer bounds
        var bounds = geojsonLayer.getBounds();
        map.fitBounds(bounds);
    };

    reader.readAsText(file);
});

document.getElementById('fileInput').addEventListener('change', function(event) {
    var file = event.target.files[0];
    var reader = new FileReader();

    reader.onload = function(e) {
        var data = JSON.parse(e.target.result);
        var latlngs = data.coordinates;

        var polyline = L.polyline(latlngs, { color: 'red' }).addTo(map);
        importedPolylines.push(polyline);

        map.fitBounds(polyline.getBounds());
    };

    reader.readAsText(file);
});

document.getElementById('locationSelect').addEventListener('change', function(e) {
    var selectedLocation = e.target.value;
    fetch(`https://ordinals.com/content/${selectedLocation}`)
        .then(response => response.text())
        .then(contentData => {
            console.log(contentData);
        })
        .catch(error => console.error('Error fetching content data:', error));
});

document.getElementById('removeButton').addEventListener('click', function() {
    importedPolylines.forEach(function(polyline) {
        map.removeLayer(polyline);
    });
    importedPolylines = [];
    document.getElementById('fileInput').value = '';
});

document.getElementById('clearMapButton').addEventListener('click', function() {
    markers.forEach(function(marker) {
        map.removeLayer(marker);
    });
    markers = [];

    if (pathPolyline) {
        map.removeLayer(pathPolyline);
        pathPolyline = null;
    }

    importedPolylines.forEach(function(polyline) {
        map.removeLayer(polyline);
    });
    importedPolylines = [];

    if (geojsonLayer) {
        map.removeLayer(geojsonLayer);
        geojsonLayer = null;
    }

    if (pathStartMarker) {
        map.removeLayer(pathStartMarker);
        pathStartMarker = null;
    }

    if (pathEndMarker) {
        map.removeLayer(pathEndMarker);
        pathEndMarker = null;
    }

    pathCoordinates = [];
    coordinates = { "coordinates": [] };
    document.getElementById('fileInput').value = '';
    document.getElementById('geojsonInput').value = '';
    document.getElementById('distanceDisplay').textContent = '';
    document.getElementById('coordinateInput').value = '';
});

document.getElementById('togglePathScribeButton').addEventListener('click', function() {
    pathScribeMode = !pathScribeMode;
    addPathMode = false;
    firstCoordinateAdded = false; // Reset the flag when PathScribe mode is toggled
    var button = document.getElementById('togglePathScribeButton');
    button.textContent = pathScribeMode ? 'Deactivate PathScribe Mode' : 'Activate PathScribe Mode';
    button.classList.toggle('active', pathScribeMode);
    document.getElementById('addPathButton').style.display = pathScribeMode ? 'block' : 'none';
    document.getElementById('addPathButton').disabled = true; // Disable the button initially
    // document.getElementById('showCoordinatesButton').style.display = 'none';

    if (!pathScribeMode) {
        if (pathStartMarker) {
            map.removeLayer(pathStartMarker);
            pathStartMarker = null;
        }
        if (pathEndMarker) {
            map.removeLayer(pathEndMarker);
            pathEndMarker = null;
        }
        if (pathPolyline) {
            map.removeLayer(pathPolyline);
            pathPolyline = null;
        }
        pathCoordinates = [];
        document.getElementById('coordinateInput').value = '';
    }
    document.getElementById('distanceDisplay').textContent = '';
});

document.getElementById('addPathButton').addEventListener('click', function() {
    addPathMode = !addPathMode;
    var button = document.getElementById('addPathButton');
    button.textContent = addPathMode ? 'Deactivate Add Path' : 'Activate Add Path';
    button.classList.toggle('active', addPathMode);
    // document.getElementById('showCoordinatesButton').style.display = addPathMode ? 'block' : 'none';

    if (!addPathMode) {
        if (pathEndMarker) {
            map.removeLayer(pathEndMarker);
            pathEndMarker = null;
        }
        if (pathPolyline) {
            map.removeLayer(pathPolyline);
            pathPolyline = null;
        }
        pathCoordinates = pathStartMarker ? [pathStartMarker.getLatLng()] : [];
        document.getElementById('distanceDisplay').textContent = '';
    }
});

document.getElementById('createContentButton').addEventListener('click', function() {
    updateCoordinatesJSON();
    var coordinatesJson = document.getElementById('coordinatesDisplay').textContent;
    var jsonWindow = window.open('', 'jsonWindow', 'width=600,height=400');
    jsonWindow.document.write('<pre>' + coordinatesJson + '</pre>');
});

imageInput.addEventListener('change', function(event) {
    var file = event.target.files[0];
    var reader = new FileReader();

    reader.onload = function(e) {
        var imageUrl = e.target.result;
        if (imageOverlay) {
            map.removeLayer(imageOverlay);
        }
        imageOverlay = L.imageOverlay(imageUrl, imageBounds, { interactive: true }).addTo(map);

        imageOverlay.on('load', function() {
            updateImageBoundsDisplay();
            mapBoundsControls.style.display = 'block';
        });
    };

    reader.readAsDataURL(file);
});

document.getElementById('editSouthWestButton').addEventListener('click', function() {
    if (editingBoundary !== 'southwest') {
        editingBoundary = 'southwest';
        imageOverlay.getElement().classList.add('faded');
        this.classList.add('active');
        document.getElementById('editNorthEastButton').disabled = true;
    } else {
        editingBoundary = null;
        imageOverlay.getElement().classList.remove('faded');
        this.classList.remove('active');
        document.getElementById('editNorthEastButton').disabled = false;
    }
});

document.getElementById('editNorthEastButton').addEventListener('click', function() {
    if (editingBoundary !== 'northeast') {
        editingBoundary = 'northeast';
        imageOverlay.getElement().classList.add('faded');
        this.classList.add('active');
        document.getElementById('editSouthWestButton').disabled = true;
    } else {
        editingBoundary = null;
        imageOverlay.getElement().classList.remove('faded');
        this.classList.remove('active');
        document.getElementById('editSouthWestButton').disabled = false;
    }
});

document.getElementById('fullSizeButton').addEventListener('click', function() {
    imageBounds = [[-90, -180], [90, 180]];
    if (imageOverlay) {
        imageOverlay.setBounds(imageBounds);
    }
    updateImageBoundsDisplay();
});

document.getElementById('toggleLocationButton').addEventListener('click', function() {
    locationSelectMode = !locationSelectMode;
    var button = document.getElementById('toggleLocationButton');
    var input = document.getElementById('profileLocation');
    if (locationSelectMode) {
        button.textContent = 'Lock location📍';
        input.disabled = false;
        this.classList.add('active');
    } else {
        button.textContent = 'Set Location🔒';
        input.disabled = true;
        this.classList.remove('active');
        const latlng = input.value.split(',').map(coord => parseFloat(coord.trim()));
        updateProfileImageMarker({ lat: latlng[0], lng: latlng[1] });
    }
});

document.getElementById('createDomainButton').addEventListener('click', function() {
    var domainMapId = document.getElementById('domainMapId').value;
    var domainTarget = document.getElementById('domainTarget').value;
    var hexagonInputs = document.querySelectorAll('.hexagon-input');
    var hexagon = Array.from(hexagonInputs).map(input => input.value);
    // var imageInput = document.getElementById('imageInput');

    if (hexagon.length !== 6) {
        alert('Please ensure there are exactly 6 hexagon values.');
        return;
    }

    var mapCoordinates = "";
    if (domainMapId && imageInput.files.length > 0) {
        mapCoordinates = JSON.stringify(imageBounds); // Use imageBounds if domainMap has a value
    } else if (domainMapId ) {
        mapCoordinates = "[[-90,-180],[90,180]]"; // Default coordinates if image selected but no domainMap
    }

    var domain = {
        map: domainMapId || "",
        mapCoordinates: mapCoordinates,
        target: domainTarget || "",
        hexagon: hexagon
    };

    var domainJson = JSON.stringify(domain, null, 2);
    console.log(domainJson);

    var jsonWindow = window.open('', 'jsonWindow', 'width=600,height=400');
    jsonWindow.document.write('<pre>' + domainJson + '</pre>');
    jsonWindow.document.close();
    // Add code here to handle the created JSON (e.g., download it, send it to a server, etc.)
});

document.getElementById('createProfileButton').addEventListener('click', function() {
    var profileName = document.getElementById('profileName').value;
    var profileTarget = document.getElementById('profileTarget').value;
    var profileLocation = document.getElementById('profileLocation').value;
    var profileImg = document.getElementById('profileImg').value;
    var profile = {
        name: profileName,
        imgId: profileImg,
        location: profileLocation,
        target: profileTarget,
    };
    var profileJson = JSON.stringify(profile, null, 2);
    console.log(profileJson);

    var jsonWindow = window.open('', 'jsonWindow', 'width=600,height=400');
    jsonWindow.document.write('<pre>' + profileJson + '</pre>');
    // Add code here to handle the created JSON (e.g., download it, send it to a server, etc.)
});

document.getElementById('profileImageInput').addEventListener('change', function(event) {
    var file = event.target.files[0];
    var reader = new FileReader();

    reader.onload = function(e) {
        var imageUrl = e.target.result;
        var profileLocation = document.getElementById('profileLocation').value;
        var coordinates = profileLocation.split(',').map(coord => parseFloat(coord.trim()));

        if (profileImageMarker) {
            map.removeLayer(profileImageMarker);
        }

        var icon = L.divIcon({
            className: 'profile-image-marker',
            html: `<div style="width: 30px; height: 30px; background-image: url(${imageUrl}); background-size: cover; border-radius: 50%; border: 2px solid red;"></div>`
        });

        profileImageMarker = L.marker([coordinates[0], coordinates[1]], { icon: icon }).addTo(map);

        if (profileLocationMarker) {
            map.removeLayer(profileLocationMarker);
            profileLocationMarker = null; // Hide the profile location pin when image is uploaded
        }
    };

    reader.readAsDataURL(file);
});

document.getElementById('searchButton').addEventListener('click', async function () {
    try {
        const bitmapNumber = parseInt(searchInput.value, 10);
        fetchPathscribers(bitmapNumber);
    } catch (error) {
        console.error("Error:", error);
    }
});

searchInput.addEventListener('keypress', function (event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        document.getElementById('searchButton').click();
    }
});

document.getElementById('createMetadataButton').addEventListener('click', function() {
    console.log("metadata");
    const name = document.getElementById('nameInput').value;
    const info = document.getElementById('infoInput').value;
    const type = pathCoordinates.length === 1 ? 1 : (pathCoordinates.length === 0 ? "" : 2);
    

    const firstCoordinate = (pathCoordinates.length > 0) ? [pathCoordinates[0].lat.toFixed(5), pathCoordinates[0].lng.toFixed(5)] : ["", ""];
    console.log("firstCoordinate.lat: " + firstCoordinate);

    const metadata = {
        name: name,
        hexagonData: hexagonData,
        start: firstCoordinate ||"",
        type: type,
        info: info
    }

    const metadataJson = JSON.stringify(metadata, null, 2);
    console.log(metadataJson);

    const jsonWindow = window.open('', 'jsonWindow', 'width=600,height=400');
    jsonWindow.document.write('<pre>' + metadataJson + '</pre>');
});

imageInput.addEventListener('change', function() {
    if (imageInput.files.length > 0) {
        removeMapButton.style.display = 'inline';
        var file = imageInput.files[0];
        var reader = new FileReader();
        reader.onload = function(e) {
            var imageUrl = e.target.result;
            if (imageOverlay) {
                map.removeLayer(imageOverlay);
            }
            imageOverlay = L.imageOverlay(imageUrl, imageBounds, { interactive: true }).addTo(map);
            mapBoundsControls.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
});

removeMapButton.addEventListener('click', function() {
    imageInput.value = "";
    removeMapButton.style.display = 'none';
    if (imageOverlay) {
        map.removeLayer(imageOverlay);
        imageOverlay = null;
    }
    mapBoundsControls.style.display = 'none';
});

//Map start
map.on('click', onMapClick);

map.on('contextmenu', function(e) {
    if (pathScribeMode && addPathMode) {
        if (pathCoordinates.length > 1) {
            pathCoordinates.pop();
            map.removeLayer(pathEndMarker);
            pathEndMarker = null;

            if (pathCoordinates.length > 1) {
                pathEndMarker = L.marker(pathCoordinates[pathCoordinates.length - 1], { draggable: true }).addTo(map);
            }

            pathPolyline.setLatLngs(pathCoordinates);
            updatePathDistance();
        }
    } else {
        map.closePopup();
    }
});
function onMapClick(e) {
    if (pathScribeMode) {
        if (!addPathMode) {
            if (pathStartMarker) {
                pathStartMarker.setLatLng(e.latlng);
            } else {
                pathStartMarker = L.marker(e.latlng, { draggable: true }).addTo(map);
            }
            document.getElementById('coordinateInput').value = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;

            pathCoordinates = [e.latlng];

            pathStartMarker.on('dragend', function(event) {
                var marker = event.target;
                var position = marker.getLatLng();
                pathCoordinates[0] = position;
                document.getElementById('coordinateInput').value = `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
            });
            firstCoordinateAdded = true;
            document.getElementById('addPathButton').disabled = false;

        } else {
            var latLng = e.latlng;
            pathCoordinates.push(latLng);
            if (pathEndMarker) {
                map.removeLayer(pathEndMarker);
            }
            pathEndMarker = L.marker(latLng, { draggable: true }).addTo(map);

            pathEndMarker.on('dragend', function(event) {
                var marker = event.target;
                var position = marker.getLatLng();
                pathCoordinates[pathCoordinates.length - 1] = position;
                pathPolyline.setLatLngs(pathCoordinates);
                updatePathDistance();
            });

            if (pathPolyline) {
                pathPolyline.setLatLngs(pathCoordinates);
            } else {
                pathPolyline = L.polyline(pathCoordinates, { color: 'blue' }).addTo(map);
            }

            updatePathDistance();
        }
    } else if (editingBoundary) {
        const latlng = e.latlng;
        if (editingBoundary === 'southwest') {
            imageBounds[0] = [latlng.lat, latlng.lng];
            if (swMarker) {
                swMarker.setLatLng(latlng);
            } else {
                swMarker = L.marker(latlng, { draggable: true, icon: L.divIcon({ className: 'boundary-marker', html: '📍', iconAnchor: [12, 24] }) }).addTo(map);
            }
        } else if (editingBoundary === 'northeast') {
            imageBounds[1] = [latlng.lat, latlng.lng];
            if (neMarker) {
                neMarker.setLatLng(latlng);
            } else {
                neMarker = L.marker(latlng, { draggable: true, icon: L.divIcon({ className: 'boundary-marker', html: '📍', iconAnchor: [12, 24] }) }).addTo(map);
            }
        }
        imageOverlay.setBounds(imageBounds);
        updateImageBoundsDisplay();
    } else if (locationSelectMode) {
        document.getElementById('profileLocation').value = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
        document.getElementById('profileImageInput').disabled = false; // Enable image upload after location selection
        updateProfileImageMarker(e.latlng);
    } else {
        // Add grey dot marker or update its position
        if (greyDotMarker) {
            greyDotMarker.setLatLng(e.latlng);
        } else {
            greyDotMarker = L.circleMarker(e.latlng, {
                radius: 5,
                color: '#808080',
                fillColor: '#808080',
                fillOpacity: 1
            }).addTo(map);
        }

        // Show popup at the bottom center of the map
        var mapContainer = document.getElementById('mapContainer');
        var popupLatLng = map.containerPointToLatLng([mapContainer.clientWidth / 2, mapContainer.clientHeight]);

        popup
            .setLatLng(popupLatLng)
            .setContent(`
                Coordinates: ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}
            `)
            .on('click', removePopupAndMarker)
            .openOn(map);
    }
}
//Map end


//Toggle Panels
function togglePanel(panelId, buttonId) {
    const panels = ['controlPanel', 'pathScribePanel', 'observatoryPanel', 'createProfilePanel','createDomainPanel', 'appInfoPanel'];
    const buttons = ['toggleControlPanel', 'togglePathScribePanel', 'toggleObservatoryPanel', 'toggleCreateProfilePanel','toggleCreateDomainPanel', 'appLogo'];

    panels.forEach((id, index) => {
        const panel = document.getElementById(id);
        const button = document.getElementById(buttons[index]);

        if (id === panelId) {
            if (panel.classList.contains('open')) {
                panel.classList.remove('open');
                panel.classList.add('closed');
                button.classList.remove('active');
            } else {
                panel.classList.remove('closed');
                panel.classList.add('open');
                button.classList.add('active');
            }
        } else {
            panel.classList.remove('open');
            panel.classList.add('closed');
            button.classList.remove('active');
        }
    });

    map.invalidateSize();
}

document.getElementById('toggleControlPanel').addEventListener('click', function() {
    togglePanel('controlPanel', 'toggleControlPanel');
});

document.getElementById('togglePathScribePanel').addEventListener('click', function() {
    togglePanel('pathScribePanel', 'togglePathScribePanel');
});

document.getElementById('toggleObservatoryPanel').addEventListener('click', function() {
    togglePanel('observatoryPanel', 'toggleObservatoryPanel');
});

document.getElementById('toggleCreateProfilePanel').addEventListener('click', function() {
    togglePanel('createProfilePanel', 'toggleCreateProfilePanel');
});
document.getElementById('toggleCreateDomainPanel').addEventListener('click', function() {
    togglePanel('createDomainPanel', 'toggleCreateDomainPanel');
});

document.getElementById('appLogo').addEventListener('click', function() {
    togglePanel('appInfoPanel', 'appLogo');
});

document.getElementById('toggleSearchContainer').addEventListener('click', function() {
    var searchContainer = document.getElementById('searchContainer');
    var toggleButton = document.getElementById('toggleSearchContainer');

    if (searchContainer.style.display === 'none') {
        searchContainer.style.display = 'flex';
        toggleButton.classList.add('active');
    } else {
        searchContainer.style.display = 'none';
        toggleButton.classList.remove('active');
    }
});
//Toggle End

//Radar start
var ctx = document.getElementById('radarChart').getContext('2d');
var radarChart = new Chart(ctx, {
    type: 'radar',
    data: {
        labels: ["1 label","2 label","3 label","4 label","5 label","6 label"],
        datasets: [{
            label: "Radar",
            data: [1, 1, 1, 1, 1, 1],
            fill: true,
            backgroundColor: 'rgba(179,181,198,0.2)',
            borderColor: 'rgba(179,181,198,1)',
            pointBackgroundColor: 'rgba(179,181,198,1)',
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: 'rgba(179,181,198,1)'
        }]
    },
    options: {
        maintainAspectRatio: false,
        scales: {
            r: {
                min: 0,
                max: 9,
                ticks: {
                    beginAtZero: true,
                    min: 0,
                    max: 9,
                    stepSize: 1,
                    display: false
                },
                grid: {
                    circular: true
                },
                pointLabels: {
                    fontSize: 12
                }
            }
        },
        plugins: {
            datalabels: {
                color: '#36A2EB',
                anchor: 'end',
                align: 'end',
                formatter: function(value, context) {
                    if(value==9 ||  value==0){
                        return null;
                    }else{
                        return value;
                    }
                }
            }
        }
    },
    plugins: [ChartDataLabels]
});



canvas.addEventListener('mousemove', function(event) {
    var points = radarChart.getElementsAtEventForMode(event, 'nearest', { intersect: false }, true);
    if (points.length) {
        canvas.style.cursor = 'pointer';
    } else {
        canvas.style.cursor = 'default';
    }
});

canvas.addEventListener('click', function(event) {
    var points = radarChart.getElementsAtEventForMode(event, 'nearest', { intersect: false }, true);
    if (points.length) {
        // Get the first clicked point
        var firstPoint = points[0];
        var labelIndex = firstPoint.index;
        var label = radarChart.data.labels[labelIndex];
        var currentValue = radarChart.data.datasets[0].data[labelIndex];
        var newValue = prompt(`Enter new value for ${label}:`, currentValue);
        if (newValue !== null) {
            radarChart.data.datasets[0].data[labelIndex] = parseFloat(newValue);
            radarChart.update();
            hexagonData = radarChart.data.datasets[0].data;
        }
    }
});

function updateRadarChartLabels(newLabels) {
    radarChart.data.labels = newLabels;
    console.log('newLabels:', newLabels);
    radarChart.update();
}
//Radar End

//Functions START
//I want to remove this`fanctionality`
function getLast6DigitsFromLat(lat) {
    var latStr = lat.toString().split('.')[1] || '';
    return latStr.slice(-6).split('').map(Number);
}

function calculateTotalDistance(coords) {
    let totalDistance = 0;
    for (let i = 1; i < coords.length; i++) {
        totalDistance += map.distance(coords[i - 1], coords[i]);
    }
    return (totalDistance / 1000).toFixed(2);
}

function updatePathDistance() {
    var totalDistance = calculateTotalDistance(pathCoordinates);
    document.getElementById('distanceDisplay').textContent = `Path Distance: ${totalDistance} km`;
}

function removePopupAndMarker() {
    if (popup) {
        map.closePopup(popup);
    }
    if (greyDotMarker) {
        map.removeLayer(greyDotMarker);
        greyDotMarker = null;
    }
}

function updateImageBoundsDisplay() {
    if (imageOverlay) {
        var bounds = imageOverlay.getBounds();
        document.getElementById('southwestCoords').textContent = `${bounds.getSouthWest().lat.toFixed(5)}, ${bounds.getSouthWest().lng.toFixed(5)}`;
        document.getElementById('northeastCoords').textContent = `${bounds.getNorthEast().lat.toFixed(5)}, ${bounds.getNorthEast().lng.toFixed(5)}`;
    }
}

function updateCoordinatesJSON() {
    var formattedCoordinates = pathCoordinates.map(latlng => {
        return [latlng.lat.toFixed(5), latlng.lng.toFixed(5)];
    });
    var coordinatesJson = JSON.stringify({ coordinates: formattedCoordinates }, null, 2);
    document.getElementById('coordinatesDisplay').textContent = coordinatesJson;
}

function closePanel() {document.getElementById('coordinatesPanel').style.display = 'none';}

function copyToClipboard() {
    var coordinatesText = document.getElementById('coordinatesDisplay').textContent;
    navigator.clipboard.writeText(coordinatesText).then(function() {
        alert('Coordinates copied to clipboard');
    }, function(err) {
        console.error('Could not copy text: ', err);
    });
}

async function fetchPathscribers(bitmapNumber) {
    const inscriptionData = [];
    // Clear existing markers
    for (const marker of profileMarkers) {
        map.removeLayer(marker); // Remove from the map
    }

    const sat = await getBitmapSat(bitmapNumber);
    const domain = bitmapNumber + ".pathscribe";
    console.log('Sat number:', sat);

    // Fetch the inscription ID of Bitmap using the sat number
    const bitmapId = await getBitmapInscriptionId(bitmapNumber);
    console.log('Bitmap ID:', bitmapId);

    // Find if there is a domain (xxx.pathscribe) at the bitmap, if it exists return InscriptionId 
    const DomainInscriptionId = await findChildContains(bitmapId, domain);
    if (DomainInscriptionId === null) {
        console.log('No domain found at: ', bitmapNumber);
        locationSelect.innerHTML = '';
        return;
    }
    console.log('Pathscribe Domain ID:', DomainInscriptionId);
    //Find metadata of domain
    domainMetadata = await getInscriptionMetadata(DomainInscriptionId);

    //Update Hagagon labels
    if (domainMetadata && Array.isArray(domainMetadata.hexagon)) {
        console.log('Domain Metadata.hexagon is array:', domainMetadata);
        updateRadarChartLabels(domainMetadata.hexagon);
    } else {
        console.error('Error: domainMetadata.hexagon is not an array or is undefined.', domainMetadata.hexagon);
    }

    const pathscribers = await findAllPathscriberChildren(DomainInscriptionId, domain);
    if (pathscribers === null) {
        console.log('No Pathscribers found at: ', domain);
        locationSelect.innerHTML = '';
        return;
    }
    console.log("PathScribers at " + domain + " : " + pathscribers);

    // Array to store data for each inscription
    for (const inscriptionId of pathscribers) {
        // Fetch Pathscriber Content and Metadata for each InscriptionId
        const content = await fetchInscriptionContent(inscriptionId);
        console.log('Inscription Content:', content);
        const metadata = await getInscriptionMetadata(inscriptionId);
        console.log('Metadata:', metadata);
        // Store the data in the array
        inscriptionData.push({
            inscriptionId: inscriptionId,
            content: content,
            metadata: metadata
        });
    }
    console.log('All Inscription Data:', inscriptionData);

    // Otherwise, create options and markers for each data item
    for (const data of inscriptionData) {
        const option = document.createElement('option');
        option.value = data.inscriptionId;
        option.textContent = data.metadata.name + " - " + data.content;
        locationSelect.appendChild(option);

        // Create at the map the Pathscribers
        const imgUrl = "https://ordinals.com/content/" + data.metadata.imgId;
        const imgLocation = data.metadata.location.split(',').map(coord => parseFloat(coord.trim()));
        const marker = createProfileMarker(imgUrl, imgLocation, data);
        
        // Store the marker in the profileMarkers array
        profileMarkers.push(marker);
    }
}

// Function to update the profile image marker
async function createProfileMarker(imageUrl, coordinates, data) {
    
    const icon = L.divIcon({
        className: 'profile-image-marker',
        html: `<div style="width: 30px; height: 30px; background-image: url(${imageUrl}); background-size: cover; border-radius: 50%; border: 2px solid red;"></div>`
    });
    const profileImageMarker = L.marker([coordinates[0], coordinates[1]], { icon: icon }).addTo(map);
    const popupContent = `<strong>Pathscriber:</strong> ${data.content}<br><strong>Name:</strong> ${data.metadata.name}<br><strong>Target:</strong> ${data.metadata.target}<br><strong>InscriptionId:</strong> ${data.inscriptionId}`;
    profileImageMarker.bindPopup(popupContent);
    
    profileImageMarker.on('click', async function () {
        console.log('Inscription ID Selected:', data.inscriptionId);
        createPathsMarker(data.inscriptionId);
        profileImageMarker.openPopup();
    });

    return profileImageMarker; 
}

async function createPathsMarker(ProfileInscriptionId) {
    const pathData = [];
    
    const paths = await getChildrenInscriptions(ProfileInscriptionId); 
    console.log('children Paths:', paths);

    for (const inscriptionId of paths) {
        const content = await fetchInscriptionContent(inscriptionId);
        console.log('Inscription Content:', content);
        const metadata = await getInscriptionMetadata(inscriptionId);
        console.log('Metadata:', metadata);

        pathData.push({
            inscriptionId: inscriptionId,
            content: content,
            metadata: metadata
        });
        console.log('pathData:', pathData);

        var data = JSON.parse(content);
        var latlngs = data.coordinates;
        var polyline = L.polyline(latlngs, { color: 'red' }).addTo(map);
        importedPolylines.push(polyline);

        if (latlngs && latlngs.length > 0) {
            const startPoint = latlngs[0];

            if (latlngs.length === 1) {
                const marker = L.marker(startPoint, { 
                    icon: L.icon({
                        iconUrl: 'img/blue_pin.png',
                        iconSize: [25, 30], 
                        iconAnchor: [12, 30]
                    })
                }).addTo(map);

                marker.bindPopup(`
                    <strong>Name:</strong> ${metadata.name}<br>
                    <strong>Info:</strong> ${metadata.info}<br>
                    <strong>Inscription ID:</strong> ${inscriptionId}
                `);
            } else {
                const startMarker = L.marker(startPoint, { 
                    icon: L.icon({
                        iconUrl: 'img/green_pin.png',
                        iconSize: [25, 30], 
                        iconAnchor: [12, 30]
                    })
                }).addTo(map);

                startMarker.bindPopup(`
                    <strong>Name:</strong> ${metadata.name}<br>
                    <strong>Info:</strong> ${metadata.info}<br>
                    <strong>Inscription ID:</strong> ${inscriptionId}
                `);

                startMarker.on('click', function() {
                    // Call the createRadarChart function with hexagonData from metadata
                    createRadarChart(metadata.name, metadata.hexagonData, domainMetadata.hexagon);
                });

                const endPoint = latlngs[latlngs.length - 1];
                const endMarker = L.marker(endPoint, { 
                    icon: L.icon({
                        iconUrl: 'img/red_pin.png',
                        iconSize: [25, 30], 
                        iconAnchor: [12, 30]
                    })
                }).addTo(map);

                endMarker.bindPopup(`
                    <strong>Name:</strong> ${metadata.name}<br>
                    <strong>Info:</strong> ${metadata.info}<br>
                    <strong>Inscription ID:</strong> ${inscriptionId}
                `);
            }

            map.fitBounds(polyline.getBounds());
        }
    }
}

function createRadarChart(label,values,labels) {
    var ctx = document.getElementById('radarChartMap').getContext('2d');

    if (radarChartMap) {
        radarChartMap.destroy();
    }
    radarChartMap = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: values,
                fill: true,
                backgroundColor: 'rgba(179,181,198,0.2)',
                borderColor: 'rgba(179,181,198,1)',
                pointBackgroundColor: 'rgba(179,181,198,1)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgba(179,181,198,1)'
            }]
        },
        options: {
            maintainAspectRatio: false,
            scales: {
                r: {
                    min: 0,
                    max: 9,
                    ticks: {
                        beginAtZero: true,
                        min: 0,
                        max: 9,
                        stepSize: 1,
                        display: false
                    },
                    grid: {
                        circular: true
                    },
                    pointLabels: {
                        fontSize: 12
                    }
                }
            },
            plugins: {
                datalabels: {
                    color: '#36A2EB',
                    anchor: 'end',
                    align: 'end',
                    formatter: function(value, context) {
                        if(value==9 ||  value==0){
                            return null;
                        }else{
                            return value;
                        }
                    }
                }
            }
        },
        plugins: [ChartDataLabels]
    });
}


function updateProfileImageMarker(latlng) {
    if (profileLocationMarker) {
        map.removeLayer(profileLocationMarker);
    }
    var profileImageInput = document.getElementById('profileImageInput');
    if (profileImageInput.files && profileImageInput.files[0]) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var imageUrl = e.target.result;
            if (profileImageMarker) {
                profileImageMarker.setLatLng(latlng);
            } else {
                profileImageMarker = createProfileMarker(imageUrl, latlng);
            }
        };
        reader.readAsDataURL(profileImageInput.files[0]);
    } else {
        // If no profile image is selected, just set the profile location marker
        profileLocationMarker = L.marker(latlng).addTo(map);
        map.panTo(latlng);
    }
}
//Functions End

//Obsarvatory START

async function fetchBlockHeight() {
    const response = await fetch('https://ordinals.com/r/blockheight');
    const data = await response.json();
    console.log("blockheight: "+ data);
    return data;
}

async function fetchBlockInfo(blockHeight) {
    console.log(blockHeight);
    const response = await fetch(`https://ordinals.com/r/blockinfo/${blockHeight}`);
    const data = await response.json();
    return data;
}

async function initializeYellowDot() {
    const blockHeightData = await fetchBlockHeight();
    lastBlockHeight = blockHeightData;
    const previousBlockHeight = lastBlockHeight - 1;

    const lastBlockInfo = await fetchBlockInfo(lastBlockHeight);
    const previousBlockInfo = await fetchBlockInfo(previousBlockHeight);

    const timeDifference = lastBlockInfo.timestamp - previousBlockInfo.timestamp;

    createYellowDot(timeDifference, lastBlockHeight, lastBlockInfo.timestamp);
}

async function checkForNewBlock() {
    const blockHeightData = await fetchBlockHeight();
    const newBlockHeight = blockHeightData;

    if (newBlockHeight !== lastBlockHeight) {
        const lastBlockInfo = await fetchBlockInfo(newBlockHeight);
        const previousBlockInfo = await fetchBlockInfo(newBlockHeight - 1);

        const timeDifference = lastBlockInfo.timestamp - previousBlockInfo.timestamp;

        createYellowDot(timeDifference, newBlockHeight, lastBlockInfo.timestamp);
        lastBlockHeight = newBlockHeight;
        resetDarknessTimer();
    } else if (document.getElementsByClassName('yellow-dot').length === 0) {
        startDarknessTimer();
        startTimePassedCounter();
    }
}

function createYellowDot(duration, blockHeight, blockTimestamp) {
    const dot = document.createElement('div');
    dot.className = 'yellow-dot';
    const label = document.createElement('div');
    label.className = 'dot-label';
    label.textContent = blockHeight;
    dot.appendChild(label);

    document.body.appendChild(dot);

    console.log('Created new yellow dot for block height:', blockHeight);

    const mapContainer = document.getElementById('mapContainer');
    const startX = 0;
    const startY = mapContainer.offsetHeight - 20;
    const endX = mapContainer.offsetWidth - 20;
    const endY = mapContainer.offsetHeight - 20;
    const controlX = mapContainer.offsetWidth / 2;
    const controlY = 20;

    dot.style.top = `${startY}px`;
    dot.style.left = `${startX}px`;

    let elapsedTime = 0;
    const now = Math.floor(Date.now() / 1000);
    elapsedTime = now - blockTimestamp;
    const remainingDuration = Math.max(duration - elapsedTime, 0);
    const startFraction = elapsedTime / duration;

    dot.style.top = `${startY}px`;
    dot.style.left = `${startX + startFraction * (endX - startX)}px`;

    const animation = dot.animate([
        { offset: 0, top: `${startY}px`, left: `${startX}px`, background: 'yellow' },
        { offset: 0.5, top: `${controlY}px`, left: `${controlX}px`, background: 'yellow' },
        { offset: 1, top: `${endY}px`, left: `${endX}px`, background: 'red' }
    ], {
        duration: remainingDuration * 1000,
        easing: 'linear',
        iterations: 1,
        fill: 'forwards'
    });

    const countdownElement = document.createElement('li');
    countdownElement.innerHTML = `
        ☀️ Bitmap: ${blockHeight}<br>
        Shining time: ${(duration / 60).toFixed(2)} minutes<br>
        Remaining: <span id="remainingTime${blockHeight}">${(remainingDuration / 60).toFixed(2)} minutes</span>
    `;

    dotObjects.push({
        blockHeight: blockHeight,
        duration: duration,
        remainingDuration: remainingDuration,
        element: countdownElement
    });

    document.getElementById('dotList').appendChild(countdownElement);

    updateListWithStarEmoji();

    const countdownInterval = setInterval(() => {
        elapsedTime++;
        const remainingTime = Math.max(duration - elapsedTime, 0);
        countdownElement.innerHTML = `
            ☀️ Bitmap: ${blockHeight}<br>
            Shining time: ${(duration / 60).toFixed(2)} minutes<br>
            Remaining: <span id="remainingTime${blockHeight}">${(remainingTime / 60).toFixed(2)} minutes</span>
        `;
        updateLastDotRemainingTime();

        if (remainingTime <= 0) {
            clearInterval(countdownInterval);
            countdownElement.innerHTML = `
                🌑 Bitmap: ${blockHeight}<br>
                Shining time: ${(duration / 60).toFixed(2)} minutes<br>
                Remaining: 0 minutes
            `;
            dot.remove();
            updateLastDotInfo(true); // Update status to died
        }
    }, 1000);

    dot.addEventListener('mouseenter', () => {
        label.style.display = 'block';
    });

    dot.addEventListener('mouseleave', () => {
        if (!label.classList.contains('toggled')) {
            label.style.display = 'none';
        }
    });

    dot.addEventListener('click', () => {
        label.classList.toggle('toggled');
        if (label.classList.contains('toggled')) {
            label.style.display = 'block';
        } else {
            label.style.display = 'none';
        }
    });

    lastDotInfo = {
        blockHeight: blockHeight,
        duration: duration,
        remainingDuration: remainingDuration,
        timestamp: blockTimestamp,
        countdownInterval: countdownInterval
    };

    updateLastDotInfo();
    resetDarknessTimer();
}

function updateListWithStarEmoji() {
    dotObjects.forEach((current, index) => {
        const hasHigherPriorityDot = dotObjects.some((other, otherIndex) => 
            otherIndex !== index &&
            other.remainingDuration > current.remainingDuration &&
            other.blockHeight < current.blockHeight &&
            other.element.innerHTML.includes('☀️')
        );

        if (hasHigherPriorityDot) {
            if (!current.element.innerHTML.includes('🌠')) {
                current.element.innerHTML = current.element.innerHTML.replace('☀️', '🌠');
            }
        } else {
            if (current.element.innerHTML.includes('🌠')) {
                current.element.innerHTML = current.element.innerHTML.replace('🌠', '☀️');
            }
        }
    });
}

function updateLastDotInfo(isDeleted = false) {
    if (lastDotInfo) {
        const lastDotElement = document.getElementById('lastDotInfo');
        if (!lastDotElement) {
            const newElement = document.createElement('div');
            newElement.id = 'lastDotInfo';
            document.getElementById('observatoryPanel').appendChild(newElement);
        }
        const status = isDeleted ? '🌑' : '☀️';
        document.getElementById('lastDotInfo').innerHTML = `
            <h4>Last Bitmap</h4>
            <p>Last Bitmap: ${lastDotInfo.blockHeight}</p>
            <p>Shining duration: ${(lastDotInfo.duration / 60).toFixed(2)} minutes</p>
            <p>Remaining: <span id="lastRemainingTime">${(lastDotInfo.remainingDuration / 60).toFixed(2)} minutes</span></p>
            <p>Status: ${status}</p>
        `;
    }
}

function updateLastDotRemainingTime() {
    const now = Math.floor(Date.now() / 1000);
    const elapsedTime = now - lastDotInfo.timestamp;
    const remainingTime = Math.max(lastDotInfo.duration - elapsedTime, 0);
    lastDotInfo.remainingDuration = remainingTime;

    document.getElementById('lastRemainingTime').textContent = (remainingTime / 60).toFixed(2) + ' minutes';
}

function startDarknessTimer() {
    if (darknessTimerInterval) {
        clearInterval(darknessTimerInterval);
    }
    darknessTimerInterval = setInterval(() => {
        darknessSeconds++;
        document.getElementById('darknessTimer').textContent = darknessSeconds;
        document.getElementById('darknessContainer').style.display = 'block';
    }, 1000);
}

function startTimePassedCounter() {
    if (timePassedInterval) {
        clearInterval(timePassedInterval);
    }
    timePassedInterval = setInterval(() => {
        const now = Math.floor(Date.now() / 1000);
        const timePassed = now - (lastDotInfo.timestamp + lastDotInfo.duration);
        document.getElementById('timePassed').textContent = timePassed;
    }, 1000);
}

function resetDarknessTimer() {
    if (darknessTimerInterval) {
        clearInterval(darknessTimerInterval);
    }
    if (timePassedInterval) {
        clearInterval(timePassedInterval);
    }
    darknessSeconds = 0;
    document.getElementById('darknessTimer').textContent = darknessSeconds;
    document.getElementById('timePassed').textContent = 0;
    document.getElementById('darknessContainer').style.display = 'none';
}
//Obsarvatory END

//change to Onload webpage
document.addEventListener('DOMContentLoaded', async () => {
    await setup();
});
