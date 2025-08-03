// ==UserScript==
// @name         Link Preview
// @namespace    http://tampermonkey.net/
// @version      0.9
// @description  An open source link previewer alternative to MaxFocus with improvements
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
    "use strict";
  
    const settings = {
      isDragMode: true,
      width: 500,
      height: 400,
      minWidth: 520,
      minHeight: 250,
      dragThreshold: 30
    };
  
    let previewWindow = null;
    let draggedLink = null;
    let isCreatingPreview = false;
    let isPreviewCreated = false;
    let linkClickPrevented = false;
  
    function loadSavedSettings() {
      const savedSettings = localStorage.getItem("linkPreviewSettings");
      if (savedSettings) {
        Object.assign(settings, JSON.parse(savedSettings));
      }
    }
  
    function saveSettings() {
      if (previewWindow) {
        settings.width = previewWindow.offsetWidth;
        settings.height = previewWindow.offsetHeight;
      }
      localStorage.setItem("linkPreviewSettings", JSON.stringify(settings));
    }
  
    loadSavedSettings();
    document.addEventListener("mousedown", handleMouseDown);
    const style = document.createElement("style");
    style.textContent = `
      .no-select {
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
      }
      
      /* Allow text selection within preview windows */
      #link-preview-window,
      #link-preview-window * {
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
          user-select: text !important;
          -webkit-touch-callout: default !important;
      }
      
      /* But prevent selection on UI elements */
      #link-preview-window button,
      #link-preview-window input {
          -webkit-user-select: none !important;
          -moz-user-select: none !important;
          -ms-user-select: none !important;
          user-select: none !important;
      }
  
      .link-preview-dragging {
          position: relative;
      }
  
      .link-preview-dragging::after {
          content: '🔍';
          position: absolute;
          top: -20px;
          right: -20px;
          background: rgba(255, 255, 255, 0.9);
          border-radius: 50%;
          padding: 4px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          font-size: 12px;
          pointer-events: none;
          animation: preview-indicator 0.3s ease-in;
      }
  
      @keyframes preview-indicator {
          from {
              opacity: 0;
              transform: scale(0.8);
          }
          to {
              opacity: 1;
              transform: scale(1);
          }
      }
  `;
    document.head.appendChild(style);
    const darkStyle = document.createElement("style");
    darkStyle.textContent = `
      @media (prefers-color-scheme: dark) {
        #link-preview-window input {
          background: rgba(50, 50, 50, 0.8);
          color: #fff;
          border: 1px solid rgba(255,255,255,0.2);
        }
        #link-preview-window button {
          background: rgba(70, 70, 70, 0.8);
          color: #fff;
          border: 1px solid rgba(255,255,255,0.2);
        }
        #link-preview-window .error-message {
          background-color: rgba(40, 40, 40, 0.9);
          color: #fff;
        }
      }
    `;
    document.head.appendChild(darkStyle);
  
    // Function to update address bar layout based on window width
    function updateAddressBarLayout(windowWidth) {
      const addressBarContainers = document.querySelectorAll('#link-preview-window .address-bar-container');
      addressBarContainers.forEach(container => {
        const addressBar = container.querySelector('input');
        const buttons = container.querySelectorAll('button');
        
        if (windowWidth < 400) {
          // Very small window - stack buttons vertically or hide some
          container.style.flexWrap = 'wrap';
          container.style.gap = '4px';
          addressBar.style.minWidth = '200px';
          addressBar.style.fontSize = '12px';
          buttons.forEach(btn => {
            btn.style.width = '28px';
            btn.style.height = '28px';
            btn.style.fontSize = '12px';
          });
        } else if (windowWidth < 500) {
          // Small window - compact layout
          container.style.flexWrap = 'nowrap';
          container.style.gap = '6px';
          addressBar.style.minWidth = '150px';
          addressBar.style.fontSize = '13px';
          buttons.forEach(btn => {
            btn.style.width = '30px';
            btn.style.height = '30px';
            btn.style.fontSize = '13px';
          });
        } else {
          // Normal window - default layout
          container.style.flexWrap = 'nowrap';
          container.style.gap = '8px';
          addressBar.style.minWidth = 'auto';
          addressBar.style.fontSize = '14px';
          buttons.forEach(btn => {
            btn.style.width = '32px';
            btn.style.height = '32px';
            btn.style.fontSize = '14px';
          });
        }
      });
    }
  
    function handleMouseDown(e) {
      // Don't interfere with preview window interactions
      if (previewWindow) {
        // Allow normal interaction within preview window
        if (e.target.closest('#link-preview-window')) {
          return;
        }
      }
  
      const target = e.target.closest("a, [data-href]");
      if (!target) return;
  
      const url = target.href || target.dataset.href;
      if (!url) return;
  
      draggedLink = target;
      isPreviewCreated = false;
      linkClickPrevented = false;
  
      const startX = e.clientX;
      const startY = e.clientY;
  
      if (settings.isDragMode) {
        // Only apply no-select to the specific link and its immediate context
        // Don't apply to the entire document body to avoid interfering with other interactions
        target.classList.add("no-select");
  
        // Only apply to direct parent, not all ancestors
        const immediateParent = target.parentElement;
        if (immediateParent && immediateParent !== document.body) {
          immediateParent.classList.add("no-select");
        }
  
        const dragHandler = (moveEvent) =>
          handleDrag(moveEvent, startX, startY, url);
        document.addEventListener("mousemove", dragHandler);
  
        const cleanupSelection = () => {
          document.removeEventListener("mousemove", dragHandler);
          target.classList.remove("no-select");
  
          // Clean up only the immediate parent
          if (immediateParent && immediateParent !== document.body) {
            immediateParent.classList.remove("no-select");
          }
        };
  
        document.addEventListener("mouseup", cleanupSelection, { once: true });
      } else {
        e.preventDefault();
        target.addEventListener("click", handleLinkClick);
        setTimeout(() => {
          if (draggedLink) {
            createPreviewWindow(url, e.clientX, e.clientY);
            isPreviewCreated = true;
            linkClickPrevented = true;
          }
        }, 500);
      }
  
      document.addEventListener("mouseup", stopInteraction, { once: true });
    }
  
    function handleDrag(e, startX, startY, url) {
      if (!draggedLink || isCreatingPreview) return;
  
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const distance = Math.hypot(dx, dy);
  
      if (distance > settings.dragThreshold * 0.5) {
        draggedLink.classList.add("link-preview-dragging");
      }
  
      if (distance > settings.dragThreshold) {
        isCreatingPreview = true;
        draggedLink.classList.remove("link-preview-dragging");
        createPreviewWindow(url, e.clientX, e.clientY);
        isPreviewCreated = true;
        linkClickPrevented = true;
        document.removeEventListener("mousemove", handleDrag);
      }
    }
  
    function stopInteraction(e) {
      if (isPreviewCreated) {
        linkClickPrevented = true;
        e.preventDefault();
      }
      document.removeEventListener("mousemove", handleDrag);
      document.removeEventListener("mouseup", stopInteraction);
  
      document.body.classList.remove("no-select");
      if (draggedLink) {
        draggedLink.classList.remove("no-select");
        draggedLink.classList.remove("link-preview-dragging");
      }
  
      setTimeout(() => {
        if (draggedLink && !settings.isDragMode) {
          draggedLink.removeEventListener("click", handleLinkClick);
        }
        draggedLink = null;
        isCreatingPreview = false;
        isPreviewCreated = false;
        linkClickPrevented = false;
      }, 100);
    }
  
    function handleLinkClick(e) {
      if (linkClickPrevented) {
        e.stopPropagation();
        linkClickPrevented = false;
      }
    }
  
    function createPreviewWindow(url, x, y) {
      if (previewWindow) {
        closePreviewWindow();
      }
  

      previewWindow = document.createElement("div");
      previewWindow.id = "link-preview-window";
      previewWindow.style.cssText = `
          position: fixed;
          left: ${x}px;
          top: ${y}px;
          width: ${settings.width}px;
          height: ${settings.height}px;
          min-width: ${settings.minWidth}px;
          min-height: ${settings.minHeight}px;
          background-color: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.5);
          border-radius: 12px;
          box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.15);
          z-index: 9999;
          resize: both;
          overflow: hidden;
  
          &:hover {
              border-color: rgba(255, 255, 255, 0.8);
              box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.25);
          }
      `;
  

      const titleBar = createTitleBar(url);
      const contentContainer = createContentContainer(url);
      previewWindow.appendChild(titleBar);
      previewWindow.appendChild(contentContainer);
      document.body.appendChild(previewWindow);
  

      titleBar.addEventListener("mousedown", initDrag);
      previewWindow.addEventListener("resize", saveSettings);
  
      // Add resize observer to handle responsive layout
      if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(entries => {
          for (let entry of entries) {
            const { width, height } = entry.contentRect;
            // Ensure minimum dimensions
            if (width < settings.minWidth) {
              previewWindow.style.width = `${settings.minWidth}px`;
            }
            if (height < settings.minHeight) {
              previewWindow.style.height = `${settings.minHeight}px`;
            }
            // Update address bar layout for small windows
            updateAddressBarLayout(width);
          }
        });
        resizeObserver.observe(previewWindow);
        
        // Store observer for cleanup
        previewWindow.resizeObserver = resizeObserver;
      }
  
      let left = x;
      let top = y;
  
      if (left + settings.width > window.innerWidth) {
        left = window.innerWidth - settings.width;
      }
      if (left < 0) {
        left = 0;
      }
  
      if (top + settings.height > window.innerHeight) {
        top = window.innerHeight - settings.height;
      }
      if (top < 0) {
        top = 0;
      }
  
      previewWindow.style.left = `${left}px`;
      previewWindow.style.top = `${top}px`;
  

      previewWindow.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          closePreviewWindow();
        }
      });
      handleIframeContentLoading(contentContainer, url);
    }
  
    function createTitleBar(url) {
      const titleBar = document.createElement("div");
      titleBar.style.cssText = `
          height: 40px;
          background-color: rgba(255, 255, 255, 0.8);
          padding: 0 15px;
          cursor: move;
          display: flex;
          align-items: center;
          gap: 10px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 10px 10px 0 0;
      `;
  
      // Title
      const title = document.createElement("span");
      title.textContent = "Link Preview";
      title.style.cssText = `
          font-family: Arial, sans-serif;
          font-size: 14px;
          font-weight: bold;
          color: #333;
          flex-shrink: 0;
      `;
      titleBar.appendChild(title);
  
      // Address bar - now in title bar
      const addressBar = createAddressBar(url);
      // Preserve existing flex layout and just ensure it takes remaining space
      addressBar.style.flex = "1";
      addressBar.style.margin = "4px 0";
      
      // Update the input field inside the address bar container
      const addressInput = addressBar.input;
      if (addressInput) {
        addressInput.style.cssText = `
            height: 24px;
            border: 1px solid rgba(0, 0, 0, 0.1);
            border-radius: 4px;
            padding: 0 8px;
            font-size: 12px;
            background: rgba(255, 255, 255, 0.9);
            color: #333;
    
            &:hover {
                border-color: rgba(0, 0, 0, 0.2);
            }
        `;
      }
      titleBar.appendChild(addressBar);
  
      // Controls container for toggle and close
      const controls = document.createElement("div");
      controls.style.cssText = `
          display: flex;
          gap: 8px;
          align-items: center;
          flex-shrink: 0;
      `;
  
      // Mode toggle
      const modeToggle = createModeToggle();
      controls.appendChild(modeToggle);
  
      // Close button
      const closeButton = createCloseButton();
      controls.appendChild(closeButton);
  
      titleBar.appendChild(controls);
  
      return titleBar;
    }
  
    function createModeToggle() {
      const modeToggle = document.createElement("button");
      modeToggle.textContent = settings.isDragMode ? "Drag" : "Click";
      modeToggle.style.cssText = `
          background: rgba(0, 0, 0, 0.05);
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 4px;
          font-size: 12px;
          color: #333;
          cursor: pointer;
          padding: 4px 8px;
          margin-right: 10px;
          transition: all 0.2s ease;
  
          &:hover {
              background: rgba(0, 0, 0, 0.1);
          }
      `;
      modeToggle.onclick = (e) => {
        e.stopPropagation();
        settings.isDragMode = !settings.isDragMode;
        modeToggle.textContent = settings.isDragMode ? "Drag" : "Click";
        saveSettings();
      };
      return modeToggle;
    }
  
    function createCloseButton() {
      const closeButton = document.createElement("button");
      closeButton.innerHTML = "&times;";
      closeButton.style.cssText = `
              background: none;
              border: none;
              font-size: 20px;
              color: #333;
              cursor: pointer;
              padding: 0;
              width: 24px;
              height: 24px;
              display: flex;
              justify-content: center;
              align-items: center;
              border-radius: 50%;
              transition: background-color 0.3s;
          `;
      closeButton.onmouseover = () => {
        closeButton.style.backgroundColor = "rgba(255, 0, 0, 0.1)";
      };
      closeButton.onmouseout = () => {
        closeButton.style.backgroundColor = "transparent";
      };
      closeButton.onclick = closePreviewWindow;
      return closeButton;
    }
  
    function createAddressBar(url) {
      // Create container for address bar and buttons
      const container = document.createElement("div");
      container.className = "address-bar-container";
      container.style.cssText = `
          display: flex;
          align-items: center;
          gap: 8px;
          width: calc(100% - 20px);
          margin: 8px 10px;
          flex-wrap: nowrap;
          min-width: 0;
      `;
      
      // Create editable input field
      const addressBar = document.createElement("input");
      addressBar.type = "text";
      addressBar.value = url;
      addressBar.style.cssText = `
          flex: 1;
          height: 32px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 6px;
          padding: 0 10px;
          font-size: 14px;
          background: rgba(255, 255, 255, 0.9);
          color: #333;
          box-sizing: border-box;
          transition: border-color 0.2s ease, font-size 0.2s ease;
          min-width: 100px;
          overflow: hidden;
          text-overflow: ellipsis;
  
          &:hover {
              border-color: rgba(0, 0, 0, 0.2);
          }
      `;
      
      // Create copy button
      const copyButton = document.createElement("button");
      copyButton.textContent = "📋";
      copyButton.title = "Copy URL";
      copyButton.style.cssText = `
          width: 32px;
          height: 32px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.9);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          transition: all 0.2s ease;
  
          &:hover {
              background: rgba(0, 0, 0, 0.1);
              border-color: rgba(0, 0, 0, 0.2);
          }
      `;
      
      copyButton.style.color = "#333";
      // Add copy functionality
      copyButton.addEventListener("click", (e) => {
          e.stopPropagation();
          addressBar.select();
          document.execCommand("copy");
          
          // Visual feedback
          const originalText = copyButton.textContent;
          copyButton.textContent = "✓";
          setTimeout(() => {
              copyButton.textContent = originalText;
          }, 1000);
      });
      
      // Create search button
      const searchButton = document.createElement("button");
      searchButton.textContent = "🔍";
      searchButton.title = "Navigate to URL";
      searchButton.style.cssText = `
          width: 32px;
          height: 32px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.9);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          transition: all 0.2s ease;
  
          &:hover {
              background: rgba(0, 0, 0, 0.1);
              border-color: rgba(0, 0, 0, 0.2);
          }
      `;
      
      searchButton.style.color = "#333";
      // Add search functionality
      searchButton.addEventListener("click", (e) => {
          e.stopPropagation();
          navigateOrSearch(addressBar.value);
      });
      
      // Create "Open in new tab" button
      const newTabButton = document.createElement("button");
      newTabButton.textContent = "↗";
      newTabButton.title = "Open in New Tab";
      newTabButton.style.cssText = `
          width: 32px;
          height: 32px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.9);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          transition: all 0.2s ease;
  
          &:hover {
              background: rgba(0, 0, 0, 0.1);
              border-color: rgba(0, 0, 0, 0.2);
          }
      `;
      
      newTabButton.style.color = "#333";
      // Add new tab functionality
      newTabButton.addEventListener("click", (e) => {
          e.stopPropagation();
          window.open(addressBar.value, "_blank");
      });
      
      // Add elements to container
      container.appendChild(addressBar);
      container.appendChild(copyButton);
      container.appendChild(searchButton);
      container.appendChild(newTabButton);
      
      // Store reference to input for external access
      container.input = addressBar;
      
      // Prevent dragging when clicking on the input field
      addressBar.addEventListener("mousedown", (e) => {
        e.stopPropagation();
      });
      
      // Helper function to detect if text is a URL
      function isValidUrl(text) {
        try {
          // Check if it's already a complete URL
          new URL(text);
          return true;
        } catch {
          // Check if it looks like a domain (contains dot and no spaces)
          if (text.includes('.') && !text.includes(' ') && text.length > 3) {
            try {
              new URL('http://' + text);
              return true;
            } catch {
              return false;
            }
          }
          return false;
        }
      }
      
      // Helper function to navigate to URL or search
      function navigateOrSearch(input) {
        const trimmed = input.trim();
        if (!trimmed) return;
        
        let finalUrl;
        if (isValidUrl(trimmed)) {
          // It's a URL - add protocol if missing
          finalUrl = trimmed.startsWith('http') ? trimmed : 'https://' + trimmed;
        } else {
          // It's a search query
          finalUrl = `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
        }
        
        // Update the iframe and address bar
        const currentPreviewWindow = container.closest('#link-preview-window');
        if (currentPreviewWindow) {
          const iframe = currentPreviewWindow.querySelector("iframe");
          if (iframe) {
            // Clear any existing error messages
            const errorMessages = currentPreviewWindow.querySelectorAll('.error-message');
            errorMessages.forEach(msg => msg.remove());
            
            // Show iframe again if it was hidden
            iframe.style.display = 'block';
            
            // Navigate to new URL
            iframe.src = finalUrl;
            addressBar.value = finalUrl;
            
            // Set up error handling for the new URL
            iframe.onerror = () => showContentError(iframe, finalUrl);
            
            // Handle iframe load to detect cross-origin issues
            iframe.onload = () => {
              try {
                // Try to access the iframe content to detect cross-origin restrictions
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                if (!iframeDoc || iframeDoc.location.href === 'about:blank') {
                  showContentError(iframe, finalUrl);
                }
              } catch (e) {
                // Cross-origin restriction detected
                showContentError(iframe, finalUrl);
              }
            };
          }
        }
      }
      
      // Allow Enter key to navigate to the URL or search
      addressBar.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          navigateOrSearch(addressBar.value);
        }
      });
      
      return container;
    }
  
    function createContentContainer(url) {
      const container = document.createElement("div");
      container.style.cssText = `
          width: 100%;
          height: calc(100% - 40px);
          overflow: hidden;
          position: relative;
      `;
  
      // Create content based on URL
      const content = createContent(url);
      container.appendChild(content.element);
  
      // Cleanup function
      container.contentCleanup = content.cleanup;
  
      //const loader = createLoadingIndicator();
      //container.appendChild(loader);
  
      //content.element.onload = () => {
      //  loader.remove();
      //};
  
      return container;
    }
  
    function createLoadingIndicator() {
      const loader = document.createElement("div");
      loader.style.cssText = `
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 40px;
          height: 40px;
          border: 3px solid rgba(0, 0, 0, 0.1);
          border-radius: 50%;
          border-top-color: #333;
          animation: spin 1s linear infinite;
      `;
  
      const keyframes = document.createElement("style");
      keyframes.textContent = `
          @keyframes spin {
              to { transform: translate(-50%, -50%) rotate(360deg); }
          }
      `;
      document.head.appendChild(keyframes);
  
      return loader;
    }
  
    function createContent(url) {
      if (isYouTubeLink(url)) {
        return createYouTubeContent(url);
      } else {
        return createStandardContent(url);
      }
    }
  
    function isYouTubeLink(url) {
      const youtubeRegex =
        /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/;
      return youtubeRegex.test(url);
    }
  
    function createYouTubeContent(url) {
      const videoId = url.match(
        /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/
      )[1];
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`;
      iframe.style.cssText = `
              width: 100%;
              height: 100%;
              border: none;
          `;
      iframe.allow = "autoplay; encrypted-media";
      iframe.allowFullscreen = true;
  
      return {
        element: iframe,
        cleanup: () => {
          iframe.src = "about:blank";
        }
      };
    }
  
    function createStandardContent(url) {
      const iframe = document.createElement("iframe");
      iframe.src = url;
      iframe.style.cssText = `
              width: 100%;
              height: 100%;
              border: none;
          `;
      iframe.onload = () => {
        // Content loaded successfully
      };
      iframe.onerror = () => {
        showContentError(iframe, url);
      };
  
      return {
        element: iframe,
        cleanup: () => {
          iframe.src = "about:blank";
        }
      };
    }
  
    function showContentError(iframe, url) {
      const errorMessage = document.createElement("div");
      errorMessage.className = "error-message";
      errorMessage.style.cssText = `
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              text-align: center;
              padding: 20px;
              font-family: Arial, sans-serif;
              background-color: #fff;
              color: #333;
              border-radius: 10px;
              box-shadow: 0 4px 8px rgba(0,0,0,0.1);
          `;
      errorMessage.innerHTML = `
              <p>This page cannot be displayed in the preview.</p>
              <button id="openInNewTab">Open in New Tab</button>
          `;
  
      errorMessage.querySelector("#openInNewTab").onclick = (e) => {
        e.stopPropagation();
        window.open(url, "_blank");
      };
  
      iframe.style.display = "none";
      iframe.parentNode.appendChild(errorMessage);
    }
  
    function handleIframeContentLoading(container, url) {
      const iframe = container.querySelector("iframe");
      if (iframe) {
        iframe.onload = () => {
          try {
            const iframeDocument =
              iframe.contentDocument || iframe.contentWindow.document;
            iframeDocument.addEventListener("click", (e) => {
              const link = e.target.closest("a");
              if (link && link.href) {
                e.preventDefault();
                iframe.src = link.href;
                
                // Update the address bar with the new URL
                const titleBar = container.previousElementSibling;
                if (titleBar) {
                  // Find the address bar container (it's a div containing the input and buttons)
                  const addressBarContainer = titleBar.querySelector('div[style*="display: flex"]');
                  if (addressBarContainer && addressBarContainer.input) {
                    addressBarContainer.input.value = link.href;
                  }
                }
              }
            });
          } catch (e) {
            // Handle cross-origin issues
            showContentError(iframe, url);
          }
        };
      }
    }
  
    function closePreviewWindow() {
      if (previewWindow) {
        saveSettings();
  
        // Clean up ResizeObserver
        if (previewWindow.resizeObserver) {
          previewWindow.resizeObserver.disconnect();
          previewWindow.resizeObserver = null;
        }
  
        // Remove event listeners
        const titleBar = previewWindow.querySelector("div");
        if (titleBar) {
          titleBar.removeEventListener("mousedown", initDrag);
        }
  
        // Stop any playing YouTube videos
        const youtubeIframe = previewWindow.querySelector(
          'iframe[src*="youtube.com"]'
        );
        if (youtubeIframe) {
          youtubeIframe.src = "about:blank";
        }
  
        // Clean up content
        if (previewWindow.contentCleanup) {
          previewWindow.contentCleanup();
        }
  
        // Remove the window from the DOM
        document.body.removeChild(previewWindow);
        previewWindow = null;
  
        // Reset flags
        draggedLink = null;
        isCreatingPreview = false;
        isPreviewCreated = false;
        linkClickPrevented = false;
      }
    }
  
    function initDrag(e) {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = previewWindow.offsetLeft;
      const startTop = previewWindow.offsetTop;
  
      function drag(e) {
        const newLeft = startLeft + e.clientX - startX;
        const newTop = startTop + e.clientY - startY;
        previewWindow.style.left = `${newLeft}px`;
        previewWindow.style.top = `${newTop}px`;
      }
  
      function stopDrag() {
        document.removeEventListener("mousemove", drag);
        document.removeEventListener("mouseup", stopDrag);
        saveSettings();
      }
  
      document.addEventListener("mousemove", drag);
      document.addEventListener("mouseup", stopDrag);
    }
  })();
  