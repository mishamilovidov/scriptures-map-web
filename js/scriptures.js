/*==============================================================================
* FILE:     scriptures.js
* AUTHOR:   Misha Milovidov
* DATE:     Winter 2018
*
* DESCRIPTION:  Front-end javascript code for The Sciptures, Mapped.
                IS 542, Winter 2018, BYU.
*/
/*property
    Animation, DROP, InfoWindow, LatLngBounds, Marker, addListener, animation,
    books, clearTimeout, content, exec, extend, fitBounds, forEach, fullName,
    geotagId, getAttribute, getCenter, getElementById, getPosition, google,
    gridName, hash, id, init, innerHTML, lat, latitude, length, lng, log,
    longitude, maps, maxBookId, minBookId, numChapters, onHashChanged, onclick,
    onerror, onload, open, parentBookId, parse, placename, position, push,
    querySelectorAll, reduce, responseText, send, setAttribute, setCenter,
    setMap, setTimeout, setZoom, showLocation, split, status, stop, substring,
    title, toString, tocName, viewAltitude, viewHeading, viewLatitude,
    viewLongitude, viewRoll, viewTilt, zoom
*/
/*global console, google, location, map, window*/
/*jslint browser: true */

const Scriptures = (function () {
    "use strict";

    /*--------------------------------------------------------------------------
     *                       CONSTANTS
     */
    const ALT_TO_ZOOM_FACTOR = 1000;
    const LAT_LON_PARSER = /\((.*),'(.*)',(.*),(.*),(.*),(.*),(.*),(.*),(.*),(.*),(.*)\)/;
    const MAX_RETRY_ARRAY = 5000;
    const SCRIPTURES_URL = "http://scriptures.byu.edu/mapscrip/mapgetscrip.php";

    /*--------------------------------------------------------------------------
     *                       PRIVATE VARIABLES
     */
    let books = {};
    let gmMarkers = [];
    let requestedBreadcrumbs;
    let retryDelay = 500;
    let volumes = [];

    /*--------------------------------------------------------------------------
     *                       PRIVATE METHOD DECLARATIONS
     */
    let addMarker;
    let ajax;
    let bookChapterValid;
    let breadcrumbs;
    let cacheBooks;
    let centerMarkers;
    let clearMarkers;
    let encodedScriptureUrlParameters;
    let getScriptureCallback;
    let getScriptureFailed;
    let hash;
    let init;
    let navigateBook;
    let navigateChapter;
    let navigateHome;
    let nextChapter;
    let onHashChanged;
    let previousChapter;
    let setupMarkers;
    let showLocation;
    let titleForBookChapter;

    /*--------------------------------------------------------------------------
     *                       PRIVATE METHODS
     */
    addMarker = function (placename, latitude, longitude) {
        let infowindow = new google.maps.InfoWindow({
            content: placename
        });
        let markerExists = false;
        let marker = new google.maps.Marker({
            position: {lat: latitude, lng: longitude},
            title: placename,
            animation: google.maps.Animation.DROP
        });
        marker.addListener("click", function () {
            infowindow.open(map, marker);
        });

        gmMarkers.forEach(function loop(gmMarker) {
            if (loop.stop) {
                return;
            }

            let gmMarkerLat = gmMarker.getPosition().lat();
            let gmMarkerLng = gmMarker.getPosition().lng();
            let markerLat = marker.getPosition().lat();
            let markerLng = marker.getPosition().lng();

            if (gmMarkerLat === markerLat && gmMarkerLng === markerLng) {
                markerExists = true;
            }

            if (markerExists) {
                loop.stop = true;
            }
        });

        if (!markerExists) {
            marker.setMap(map);
            gmMarkers.push(marker);
        }
    };

    ajax = function (url, successCallback, failureCallback, skipParse) {
        let request = new XMLHttpRequest();
        request.open("GET", url, true);

        request.onload = function () {
            if (request.status >= 200 && request.status < 400) {
                let data;

                if (skipParse) {
                    data = request.responseText;
                } else {
                    data = JSON.parse(request.responseText);
                }

                if (typeof successCallback === "function") {
                    successCallback(data);
                }
            } else {
                if (typeof failureCallback === "function") {
                    failureCallback(request);
                }
            }
        };

        request.onerror = failureCallback;
        request.send();
    };

    bookChapterValid = function (bookId, chapter) {
        let book = books[bookId];

        if (book === undefined || chapter < 0 || chapter > book.numChapters) {
            return false;
        }

        if (chapter === 0 && book.numChapters > 0) {
            return false;
        }

        return true;
    };

    breadcrumbs = function (volume, book, chapter) {
        let crumbs;

        if (volume === undefined) {
            crumbs = "<ul><li>The Scriptures</li></ul>";
        } else {
            crumbs = "<ul><li><a href=\"javascript:void(0);\" " +
                    "onclick=\"Scriptures.hash()\">The Scriptures</a></li>";

            if (book === undefined) {
                crumbs += "<li>" + volume.fullName + "</li>";
            } else {
                crumbs += "<li><a href=\"javascript:void(0);\" " +
                        "onclick=\"Scriptures.hash(" + volume.id + ")\">" +
                        volume.fullName + "</a></li>";

                if (chapter === undefined || chapter <= 0) {
                    crumbs += "<li>" + book.tocName + "</li>";
                } else {
                    crumbs += "<ul><li><a href=\"javascript:void(0);\" " +
                            "onclick=\"Scriptures.hash(0," + book.id + ")\">" +
                            book.tocName + "</a></li>";
                    crumbs += "<li>" + chapter + "</li>";
                }
            }
        }

        return crumbs + "</ul>";
    };

    cacheBooks = function (callback) {
        volumes.forEach(function (volume) {
            let volumeBooks = [];
            let bookId = volume.minBookId;

            while (bookId <= volume.maxBookId) {
                volumeBooks.push(books[bookId]);
                bookId += 1;
            }

            volume.books = volumeBooks;
        });

        if (typeof callback === "function") {
            callback();
        }

    };

    centerMarkers = function (gmMarkers) {
        if (gmMarkers.length === 1) {
            map.zoom = 5;
        } else if (gmMarkers.length > 1) {
            let bounds = gmMarkers.reduce(function (bounds, marker) {
                return bounds.extend(marker.getPosition());
            }, new google.maps.LatLngBounds());

            map.setCenter(bounds.getCenter());
            map.fitBounds(bounds);
        } else {
            clearMarkers();
        }
    };

    clearMarkers = function () {
        gmMarkers.forEach(function (marker) {
            marker.setMap(null);
        });

        gmMarkers = [];
    };

    encodedScriptureUrlParameters = function (bookId, chapter, verses, isJst) {
        let options = "";

        if (bookId !== undefined && chapter !== undefined) {
            if (verses !== undefined) {
                options += verses;
            }

            if (isJst !== undefined && isJst) {
                options += "&jst=JST";
            }

            return SCRIPTURES_URL + "?book=" + bookId + "&chap=" + chapter +
                    "&verses" + options;
        }
    };

    getScriptureCallback = function (chapterHtml) {
        document.getElementById("scriptures").innerHTML = chapterHtml;
        document.getElementById("crumb").innerHTML = requestedBreadcrumbs;
        setupMarkers();
    };

    getScriptureFailed = function () {
        console.log("Warning: scripture request from server failed");
    };

    hash = function (volumeId, bookId, chapter) {
        let newHash = "";

        if (volumeId !== undefined) {
            newHash += volumeId;

            if (bookId !== undefined) {
                newHash += ":" + bookId;

                if (chapter !== undefined) {
                    newHash += ":" + chapter;
                }
            }
        }

        location.hash = newHash;
    };

    init = function (callback) {
        let booksLoaded = false;
        let volumesLoaded = false;

        ajax(
            "http://scriptures.byu.edu/mapscrip/model/books.php",
            function (data) {
                books = data;
                booksLoaded = true;

                if (volumesLoaded) {
                    cacheBooks(callback);
                }
            }
        );
        ajax(
            "http://scriptures.byu.edu/mapscrip/model/volumes.php",
            function (data) {
                volumes = data;
                volumesLoaded = true;

                if (booksLoaded) {
                    cacheBooks(callback);
                }
            }
        );
    };

    navigateBook = function (bookId) {
        let book = books[bookId];
        let volume = volumes[book.parentBookId - 1];

        if (book.numChapters === 0) {
            navigateChapter(bookId, 0);
        } else if (book.numChapters === 1) {
            navigateChapter(bookId, 1);
        } else {
            let chapter = 1;
            let navContents = "<div id=\"scripnav\">";
            navContents += "<div class=\"volume\"><h5>" + book.fullName + "</h5></div>" +
                    "<div class=\"books\">";

            while (chapter <= book.numChapters) {
                navContents += "<a class=\"btn chapter\" id=\"" + chapter + "\" href=\"#" +
                        book.parentBookId + ":" + bookId + ":" + chapter + "\">" +
                        chapter + "</a>";
                chapter += 1;
            }

            navContents += "</div></div>";
            document.getElementById("scriptures").innerHTML = navContents;
        }

        requestedBreadcrumbs = breadcrumbs(volume, book);
        document.getElementById("crumb").innerHTML = requestedBreadcrumbs;
    };

    navigateChapter = function (bookId, chapter) {
        if (bookId !== undefined) {
            let book = books[bookId];
            let currentHash = location.hash.toString().split(":");
            let nextChapterInfo = nextChapter(bookId, chapter);
            let previousChapterInfo = previousChapter(bookId, chapter);
            let volume = volumes[book.parentBookId - 1];

            requestedBreadcrumbs = breadcrumbs(volume, book, chapter);

            let nextPrevContents = "<div class=\"navheading\">";

            if (nextChapterInfo !== undefined) {
                let next = nextChapterInfo.toString().split(",");
                let nextHash = currentHash[0] + ":" + next[0] + ":" + next[1];

                nextPrevContents += "<div class=\"next\"><a class=\"btn\" href=\"" +
                        nextHash + "\">" + next[2] + "</a></div>";
            }

            if (previousChapterInfo !== undefined) {
                let previous = previousChapterInfo.toString().split(",");
                let previousHash = currentHash[0] + ":" + previous[0] + ":" + previous[1];

                nextPrevContents += "<div class=\"prev\"><a class=\"btn\" href=\"" +
                        previousHash + "\">" + previous[2] + "</a></div>";
            }

            nextPrevContents += "</div>";
            document.getElementById("nextprev").innerHTML = nextPrevContents;

            ajax(
                encodedScriptureUrlParameters(bookId, chapter),
                getScriptureCallback,
                getScriptureFailed,
                true
            );
        }
    };

    navigateHome = function (volumeId) {
        let displayedVolume;
        let navContents = "<div id=\"scripnav\">";

        volumes.forEach(function (volume) {
            if (volumeId === undefined || volume.id === volumeId) {
                navContents += "<div class=\"volume\"><a name=\"v" + volume.id + "\" /><h5>" +
                        volume.fullName + "</h5></div><div class=\"books\">";

                volume.books.forEach(function (book) {
                    navContents += "<a class=\"btn\" id=\"" + book.id + "\" href=\"#" +
                            volume.id + ":" + book.id + "\">" + book.gridName + "</a>";
                });

                navContents += "</div>";

                if (volume.id === volumeId) {
                    displayedVolume = volume;
                }
            }
        });

        navContents += "<br /><br /></div>";

        document.getElementById("scriptures").innerHTML = navContents;
        document.getElementById("crumb").innerHTML = breadcrumbs(displayedVolume);
    };

    nextChapter = function (bookId, chapter) {
        let book = books[bookId];

        if (book !== undefined) {
            if (chapter < book.numChapters) {
                return [bookId, chapter + 1, titleForBookChapter(book, chapter + 1)];
            }

            let nextBook = books[bookId + 1];

            if (nextBook !== undefined) {
                let nextChapterValue = 0;

                if (nextBook.numChapters > 0) {
                    nextChapterValue = 1;
                }

                return [nextBook.id, nextChapterValue, titleForBookChapter(
                    nextBook,
                    nextChapterValue
                )];
            }
        }
    };

    onHashChanged = function () {
        let bookId;
        let chapter;
        let ids = [];
        let volumeId;

        document.getElementById("nextprev").innerHTML = "";

        if (location.hash !== "" && location.hash.length > 1) {
            // Remove leading # and split the string on colon delimiters
            ids = location.hash.substring(1).split(":");
        }

        if (ids.length <= 0) {
            navigateHome();
        } else if (ids.length === 1) {
            // Display single volume's table of contents
            volumeId = Number(ids[0]);

            if (volumeId < volumes[0] || volumeId > volumes[volumes.length - 1].id) {
                navigateHome();
            } else {
                navigateHome(volumeId);
            }
        } else if (ids.length === 2) {
            // Display book's list of chapters
            bookId = Number(ids[1]);

            if (books[bookId] === undefined) {
                navigateHome();
            } else {
                navigateBook(bookId);
            }
        } else {
            // Display chapter contents
            bookId = Number(ids[1]);
            chapter = Number(ids[2]);

            if (!bookChapterValid(bookId, chapter)) {
                navigateHome();
            } else {
                navigateChapter(bookId, chapter);
            }
        }
    };

    previousChapter = function (bookId, chapter) {
        let book = books[bookId];

        if (book !== undefined) {
            if (chapter > 1) {
                return [bookId, chapter - 1, titleForBookChapter(book, chapter - 1)];
            }

            let previousBook = books[bookId - 1];

            if (previousBook !== undefined) {
                let previousChapterValue = 0;

                if (previousBook.numChapters > 0) {
                    previousChapterValue = previousBook.numChapters;
                }

                return [previousBook.id, previousChapterValue, titleForBookChapter(
                    previousBook,
                    previousChapterValue
                )];
            }
        }
    };

    setupMarkers = function () {
        if (window.google === undefined) {
            let retryId = window.setTimeout(setupMarkers, retryDelay);

            retryDelay += retryDelay;

            if (retryDelay > MAX_RETRY_ARRAY) {
                window.clearTimeout(retryId);
            }

            return;
        }

        if (gmMarkers.length > 0) {
            clearMarkers();
        }

        let matches;

        document.querySelectorAll("a[onclick^=\"showLocation(\"]")
            .forEach(function (element) {
                let value = element.onclick;

                matches = LAT_LON_PARSER.exec(value);

                if (matches) {
                    let placename = matches[2];
                    let latitude = Number(matches[3]);
                    let longitude = Number(matches[4]);
                    let flag = matches[11].substring(1);

                    flag = flag.substring(0, flag.length - 1);

                    if (flag !== "") {
                        placename += " " + flag;
                    }

                    addMarker(placename, latitude, longitude);
                }

                element.setAttribute(
                    "onclick",
                    "Scriptures." + element.getAttribute("onclick")
                );
            });

        centerMarkers(gmMarkers);
    };

    showLocation = function (
        geotagId,
        placename,
        latitude,
        longitude,
        viewLatitude,
        viewLongitude,
        viewTilt,
        viewRoll,
        viewAltitude,
        viewHeading
    ) {
        let locationProps = {
            geotagId: geotagId,
            placename: placename,
            latitude: latitude,
            longitude: longitude,
            viewLatitude: viewLatitude,
            viewLongitude: viewLongitude,
            viewTilt: viewTilt,
            viewRoll: viewRoll,
            viewAltitude: viewAltitude,
            viewHeading: viewHeading
        };

        clearMarkers();
        addMarker(locationProps.placename, locationProps.latitude, locationProps.longitude);
        map.setCenter({lat: locationProps.latitude, lng: locationProps.longitude});
        map.setZoom(locationProps.viewAltitude / ALT_TO_ZOOM_FACTOR);
        centerMarkers(gmMarkers);
    };

    titleForBookChapter = function (book, chapter) {
        return book.tocName + (chapter > 0
            ? " " + chapter
            : "");
    };

    /*--------------------------------------------------------------------------
     *                       PUBLIC API
     */
    return {
        hash: hash,
        init: init,
        onHashChanged: onHashChanged,
        showLocation: showLocation
    };

}());
