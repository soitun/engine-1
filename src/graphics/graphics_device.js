/**
 * @enum {number}
 * @name pc.gfx.PrimType
 * @description Constants for primitive type.
 */
pc.gfx.PrimType = {
    /** List of distinct points. */
    POINTS: 0,
    /** Discrete list of line segments. */
    LINES: 1,
    /** List of points that are linked sequentially by line segments. */
    LINE_STRIP: 2,
    /** Discrete list of triangles. */
    TRIANGLES: 3,
    /** Connected strip of triangles where a specified vertex forms a triangle using the previous two. */
    TRIANGLE_STRIP: 4
};

/**
 * @enum {number}
 * @name pc.gfx.BlendMode
 * @description Constants for blending modes.
 */
pc.gfx.BlendMode = {
    ZERO: 0,
    ONE: 1,
    SRC_COLOR: 2,
    ONE_MINUS_SRC_COLOR: 3,
    DST_COLOR: 4,
    ONE_MINUS_DST_COLOR: 5,
    SRC_ALPHA: 6,
    SRC_ALPHA_SATURATE: 7,
    ONE_MINUS_SRC_ALPHA: 8,
    DST_ALPHA: 9,
    ONE_MINUS_DST_ALPHA: 10
};

/**
 * @enum {number}
 * @name pc.gfx.DepthFunc
 * @description Constants for blending modes.
 */
pc.gfx.DepthFunc = {
    LEQUAL: 0
};

pc.gfx.FrontFace = {
    CW: 0,
    CCW: 1
};

pc.extend(pc.gfx, function () {
    var _defaultClearOptions = {
        color: [0, 0, 0, 1],
        depth: 1,
        flags: pc.gfx.ClearFlag.COLOR | pc.gfx.ClearFlag.DEPTH
    };
    
    var _contextLostHandler = function () {
        logWARNING("Context lost.");
    };

    var _contextRestoredHandler = function () {
        logINFO("Context restored.");
    };

    var _createContext = function (canvas, options) {
        var names = ["webgl", "experimental-webgl", "webkit-3d", "moz-webgl"];
        var context = null;
        for (var i = 0; i < names.length; i++) {
            try {
                context = canvas.getContext(names[i], options);
            } catch(e) {}
            if (context) {
                break;
            }
        }
        return context;
    };

    /**
     * @name pc.gfx.Device
     * @class The graphics device manages the underlying graphics context. It is responsible
     * for submitting render state changes and graphics primitives to the hardware. A graphics
     * device is tied to a specific canvas HTML element. It is valid to have more than one 
     * canvas element per page and create a new graphics device against each.
     * @param {Object} canvas
     */
    var Device = function (canvas) {
        canvas.addEventListener("webglcontextlost", _contextLostHandler, false);
        canvas.addEventListener("webglcontextrestored", _contextRestoredHandler, false);

        // Retrieve the WebGL context
        this.gl = _createContext(canvas);
        this.canvas        = canvas;
        this.program       = null;
        this.indexBuffer   = null;
        this.vertexBuffers = [];

        var gl = this.gl;
        logINFO("Device started");
        logINFO("WebGL version:             " + gl.getParameter(gl.VERSION));
        logINFO("WebGL shader version:      " + gl.getParameter(gl.SHADING_LANGUAGE_VERSION));
        logINFO("WebGL vendor:              " + gl.getParameter(gl.VENDOR));
        logINFO("WebGL renderer:            " + gl.getParameter(gl.RENDERER));
        // Note that gl.getSupportedExtensions is not actually available in Chrome 9.
        try {
            logINFO("WebGL extensions:          " + gl.getSupportedExtensions());
        }
        catch (e) {
            logINFO("WebGL extensions:          Extensions unavailable");
        }
        logINFO("WebGL num texture units:   " + gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS));
        logINFO("WebGL max texture size:    " + gl.getParameter(gl.MAX_TEXTURE_SIZE));
        logINFO("WebGL max cubemap size:    " + gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE));
        logINFO("WebGL max vertex attribs:  " + gl.getParameter(gl.MAX_VERTEX_ATTRIBS));
        logINFO("WebGL max vshader vectors: " + gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS));
        logINFO("WebGL max fshader vectors: " + gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS));
        logINFO("WebGL max varying vectors: " + gl.getParameter(gl.MAX_VARYING_VECTORS));

        this.lookup = {
            prim: [ 
                gl.POINTS, 
                gl.LINES, 
                gl.LINE_STRIP, 
                gl.TRIANGLES, 
                gl.TRIANGLE_STRIP 
            ],
            blendMode: [
                gl.ZERO,
                gl.ONE,
                gl.SRC_COLOR,
                gl.ONE_MINUS_SRC_COLOR,
                gl.DST_COLOR,
                gl.ONE_MINUS_DST_COLOR,
                gl.SRC_ALPHA,
                gl.SRC_ALPHA_SATURATE,
                gl.ONE_MINUS_SRC_ALPHA,
                gl.DST_ALPHA,
                gl.ONE_MINUS_DST_ALPHA
            ],
            clear: [
                0,
                gl.COLOR_BUFFER_BIT,
                gl.DEPTH_BUFFER_BIT,
                gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT,
                gl.STENCIL_BUFFER_BIT,
                gl.STENCIL_BUFFER_BIT|gl.COLOR_BUFFER_BIT,
                gl.STENCIL_BUFFER_BIT|gl.DEPTH_BUFFER_BIT,
                gl.STENCIL_BUFFER_BIT|gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT
            ],
            elementType: [
                gl.BYTE,
                gl.UNSIGNED_BYTE,
                gl.SHORT,
                gl.UNSIGNED_SHORT,
                gl.INT,
                gl.UNSIGNED_INT,
                gl.FLOAT
            ],
            frontFace: [
                gl.CW,
                gl.CCW
            ]
        };

        // Initialize extensions
        this.extTextureFloat = null;//gl.getExtension("OES_texture_float");
        this.extStandardDerivatives = gl.getExtension("OES_standard_derivatives");

        // Create the default render target
        var backBuffer = pc.gfx.FrameBuffer.getBackBuffer();
        var viewport = { x: 0, y: 0, width: canvas.width, height: canvas.height };
        this.renderTarget = new pc.gfx.RenderTarget(backBuffer, viewport);

        // Create the ScopeNamespace for shader attributes and variables
        this.scope = new pc.gfx.ScopeSpace("Device");

        // Define the uniform commit functions
        var self = this;
        this.commitFunction = {};
        this.commitFunction[pc.gfx.ShaderInputType.BOOL ] = function (locationId, value) { self.gl.uniform1i(locationId, value); };
        this.commitFunction[pc.gfx.ShaderInputType.INT  ] = function (locationId, value) { self.gl.uniform1i(locationId, value); };
        this.commitFunction[pc.gfx.ShaderInputType.FLOAT] = function (locationId, value) { 
            if (typeof value == "number") 
                self.gl.uniform1f(locationId, value); 
            else
                self.gl.uniform1fv(locationId, value); 
            };
        this.commitFunction[pc.gfx.ShaderInputType.VEC2 ] = function (locationId, value) { self.gl.uniform2fv(locationId, value); };
        this.commitFunction[pc.gfx.ShaderInputType.VEC3 ] = function (locationId, value) { self.gl.uniform3fv(locationId, value); };
        this.commitFunction[pc.gfx.ShaderInputType.VEC4 ] = function (locationId, value) { self.gl.uniform4fv(locationId, value); };
        this.commitFunction[pc.gfx.ShaderInputType.IVEC2] = function (locationId, value) { self.gl.uniform2iv(locationId, value); };
        this.commitFunction[pc.gfx.ShaderInputType.BVEC2] = function (locationId, value) { self.gl.uniform2iv(locationId, value); };
        this.commitFunction[pc.gfx.ShaderInputType.IVEC3] = function (locationId, value) { self.gl.uniform3iv(locationId, value); };
        this.commitFunction[pc.gfx.ShaderInputType.BVEC3] = function (locationId, value) { self.gl.uniform3iv(locationId, value); };
        this.commitFunction[pc.gfx.ShaderInputType.IVEC4] = function (locationId, value) { self.gl.uniform4iv(locationId, value); };
        this.commitFunction[pc.gfx.ShaderInputType.BVEC4] = function (locationId, value) { self.gl.uniform4iv(locationId, value); };
        this.commitFunction[pc.gfx.ShaderInputType.MAT2 ] = function (locationId, value) { self.gl.uniformMatrix2fv(locationId, self.gl.FALSE, value); };
        this.commitFunction[pc.gfx.ShaderInputType.MAT3 ] = function (locationId, value) { self.gl.uniformMatrix3fv(locationId, self.gl.FALSE, value); };
        this.commitFunction[pc.gfx.ShaderInputType.MAT4 ] = function (locationId, value) { self.gl.uniformMatrix4fv(locationId, self.gl.FALSE, value); };

        // Set the default render state
        var gl = this.gl;
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.depthFunc(gl.LEQUAL);
        gl.depthRange(0.0, 1.0);

        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        gl.frontFace(gl.CCW);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.enable(gl.SCISSOR_TEST);

        this.scope.resolve("fog_color").setValue([0.0, 0.0, 0.0, 1.0]);
        this.scope.resolve("fog_density").setValue(0.0);
        this.scope.resolve("alpha_ref").setValue(0.0);

        // Set up render state
        var _getStartupState = function () {
            return {
                alphaTest: false,
                alphaRef: 0.0,
                blend: true,
                blendModes: { srcBlend: pc.gfx.BlendMode.SRC_ALPHA, dstBlend: pc.gfx.BlendMode.ONE_MINUS_SRC_ALPHA },
                colorWrite: { red: true, green: true, blue: true, alpha: true },
                cull: true,
                depthTest: true,
                depthWrite: true,
                depthFunc: pc.gfx.DepthFunc.LEQUAL,
                fog: false,
                fogColor: [ 0, 0, 0 ],
                fogDensity: 0,
                frontFace: pc.gfx.FrontFace.CCW
            };
        };
        this._globalState = _getStartupState();
        this._currentState = _getStartupState();
        this._localState = {};

        this._stateFuncs = {};
        this._stateFuncs["blend"] = function (value) {
            if (self._currentState.blend !== value) {
                if (value) {
                    self.gl.enable(gl.BLEND);
                } else {
                    self.gl.disable(gl.BLEND);
                }
                self._currentState.blend = value;
            }
        };
        this._stateFuncs["blendModes"] = function (value) {
            if ((self._currentState.blendModes.srcBlend !== value.srcBlend) ||
                (self._currentState.blendModes.dstBlend !== value.dstBlend)) {
                self.gl.blendFunc(self.lookup.blendMode[value.srcBlend], self.lookup.blendMode[value.dstBlend]);
                self._currentState.blendModes.srcBlend = value.srcBlend;
                self._currentState.blendModes.dstBlend = value.dstBlend;
            }
        }
        this._stateFuncs["colorWrite"] = function (value) {
            self.gl.colorMask(value.red, value.green, value.blue, value.alpha);
            self._currentState.culling = value;
        };
        this._stateFuncs["cull"] = function (value) {
            if (self._currentState.cull !== value) {
                if (value) {
                    self.gl.enable(gl.CULL_FACE);
                } else {
                    self.gl.disable(gl.CULL_FACE);
                }
                self._currentState.cull = value;
            }
        };
        this._stateFuncs["depthTest"] = function (value) {
            if (self._currentState.depthTest !== value) {
                if (value) {
                    self.gl.enable(gl.DEPTH_TEST);
                } else {
                    self.gl.disable(gl.DEPTH_TEST);
                }
                self._currentState.depthTest = value;
            }
        };
        this._stateFuncs["depthWrite"] = function (value) { 
            if (self._currentState.depthWrite !== value) {
                self.gl.depthMask(value);
                self._currentState.depthWrite = value;
            }
        };
        this._stateFuncs["fog"] = function (value) {
            self._currentState.fog = value;
        };
        this._stateFuncs["fogColor"] = function (value) {
            self.scope.resolve("fog_color").setValue(value);
            self._currentState.fogColor = value;
        };
        this._stateFuncs["fogDensity"] = function (value) {
            if (self._currentState.fogDensity !== value) {
                self.scope.resolve("fog_density").setValue(value);
                self._currentState.fogDensity = value;
            }
        };
        this._stateFuncs["frontFace"] = function (value) {
            if (self._currentState.frontFace !== value) {
                self.gl.frontFace(self.lookup.frontFace[value]);
                self._currentState.frontFace = value;
            }
        };

        this.programLib = new pc.gfx.ProgramLibrary();
        for (var generator in pc.gfx.programlib) {
            this.programLib.register(generator, pc.gfx.programlib[generator]);
        }

        // Calculate a estimate of the maximum number of bones that can be uploaded to the GPU
        // based on the number of available uniforms and the number of uniforms required for non-
        // bone data.  This is based off of the Phong shader.  A user defined shader may have
        // even less space available for bones so this calculated value can be overridden via
        // pc.gfx.Device.setBoneLimit.
        var numUniforms = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS);
        numUniforms -= 4 * 4; // Model, view, projection and shadow matrices
        numUniforms -= 8;     // 8 lights max, each specifying a position vector
        numUniforms -= 1;     // Eye position
        numUniforms -= 4 * 4; // Up to 4 texture transforms
        this.boneLimit = Math.floor(numUniforms / 4);

        pc.extend(this, pc.events);
        
        this.boundBuffer = null;
    };

    /**
     * @function
     * @name pc.gfx.Device#setCurrent
     * @author Will Eastcott
     */
    Device.prototype.setCurrent = function () {
        Device._current = this;
    };

    /**
     * @function
     * @name pc.gfx.Device.getCurrent
     * @author Will Eastcott
     */
    Device.getCurrent = function () {
        return Device._current;
    };

    /**
     * @function
     * @name pc.gfx.Device#getProgramLibrary
     * @author Will Eastcott
     */
    Device.prototype.getProgramLibrary = function () {
        return this.programLib;
    };

    /**
     * @function
     * @name pc.gfx.Device#setProgramLibrary
     * @author Will Eastcott
     */
    Device.prototype.setProgramLibrary = function (programLib) {
        this.programLib = programLib;
    };

    /**
     * @function
     * @name pc.gfx.Device#stop
     * @author Will Eastcott
     */
    Device.prototype.stop = function() {
        logINFO("Device stopped");
    };

    /**
     * @function
     * @name pc.gfx.Device#updateBegin
     * @author Will Eastcott
     */
    Device.prototype.updateBegin = function() {
        logASSERT(this.canvas != null, "Device has not been started");

        // Set the render target
        this.renderTarget.bind();
    };

    /**
     * @function
     * @name pc.gfx.Device#updateEnd
     * @author Will Eastcott
     */
    Device.prototype.updateEnd = function() {
    };

    /**
     * @function
     * @name pc.gfx.Device#draw
     * @description Submits a graphical primitive to the hardware for immediate rendering.
     * @param {Object} options Optional options object that controls the behavior of the draw operation defined as follows:
     * @param {number} options.numVertices The number of vertices to dispatch in the draw call.
     * @param {boolean} options.useIndexBuffer True to interpret the primitive as indexed, thereby using the currently set index buffer and false otherwise.
     * @param {pc.gfx.PrimType} options.primitiveType The type of primitive to render.
     * @example
     * // Render a single, unindexed triangle
     * device.draw({
     *     numVertices: 3,
     *     useIndexBuffer: false,
     *     primitiveType: pc.gfx.PrimType.TRIANGLES
     * )};
     * @author Will Eastcott
     */
    Device.prototype.draw = function(options) {
        // Check there is anything to draw
        if (options.numVertices > 0) {
            // Commit the vertex buffer inputs
            this.commitAttributes(options.startVertex || 0);

            // Commit the shader program variables
            this.commitUniforms();

            var gl = this.gl;
            if (options.useIndexBuffer) {
                var glFormat = (this.indexBuffer.getFormat() === pc.gfx.IndexFormat.UINT8) ? gl.UNSIGNED_BYTE : gl.UNSIGNED_SHORT;
                gl.drawElements(this.lookup.prim[options.primitiveType],
                                options.numVertices,
                                glFormat,
                                0);
            } else {
                gl.drawArrays(this.lookup.prim[options.primitiveType],
                              0,
                              options.numVertices);
            }
        }
    };

    /**
     * @function
     * @name pc.gfx.Device#clear
     * @description Clears the frame buffer of the currently set render target.
     * @param {Object} options Optional options object that controls the behavior of the clear operation defined as follows:
     * @param {Array} options.color The color to clear the color buffer to in the range 0.0 to 1.0 for each component.
     * @param {number} options.depth The depth value to clear the depth buffer to in the range 0.0 to 1.0.
     * @param {pc.gfx.ClearFlag} options.flags The buffers to clear (the types being color, depth and stencil).
     * @example
     * // Clear color buffer to black and depth buffer to 1.0
     * device.clear();
     *
     * // Clear just the color buffer to red
     * device.clear({
     *     color: [1, 0, 0, 1],
     *     flags: pc.gfx.ClearFlag.COLOR
     * });
     *
     * // Clear color buffer to yellow and depth to 1.0
     * device.clear({
     *     color: [1, 1, 0, 1],
     *     depth: 1.0,
     *     flags: pc.gfx.ClearFlag.COLOR | pc.gfx.ClearFlag.DEPTH
     * });
     * @author Will Eastcott
     */
    Device.prototype.clear = function(options) {
        logASSERT(this.canvas != null, "Device has not been started");

        options = options || _defaultClearOptions;
        options.color = options.color || _defaultClearOptions.color;
        options.depth = options.depth || _defaultClearOptions.depth;
        options.flags = options.flags || _defaultClearOptions.flags;

        // Set the clear color
        var gl = this.gl;
        if (options.flags & pc.gfx.ClearFlag.COLOR) {
            gl.clearColor(options.color[0], options.color[1], options.color[2], options.color[3]);
        }
        
        if (options.flags & pc.gfx.ClearFlag.DEPTH) {
            // Set the clear depth
            gl.clearDepth(options.depth);
        }
        
        // Clear the frame buffer
        gl.clear(this.lookup.clear[options.flags]);
    };

    /**
     * @function
     * @name pc.gfx.Device#getGlobalState
     * @author Will Eastcott
     */
    Device.prototype.getGlobalState = function (state) {
        return this._globalState;
    };

    /**
     * @function
     * @name pc.gfx.Device#updateGlobalState
     * @author Will Eastcott
     */
    Device.prototype.updateGlobalState = function (delta) {
        for (var key in delta) {
            if (this._localState[key] === undefined) {
                this._stateFuncs[key](delta[key]);
            }
            this._globalState[key] = delta[key];
        }
    };

    /**
     * @function
     * @name pc.gfx.Device#getLocalState
     * @author Will Eastcott
     */
    Device.prototype.getLocalState = function (state) {
        return this._localState;
    };

    /**
     * @function
     * @name pc.gfx.Device#updateLocalState
     * @author Will Eastcott
     */
    Device.prototype.updateLocalState = function (localState) {
        for (var key in localState) {
            this._stateFuncs[key](localState[key]);
            this._localState[key] = localState[key];
        }
    };

    /**
     * @function
     * @name pc.gfx.Device#clearLocalState
     * @author Will Eastcott
     */
    Device.prototype.clearLocalState = function () {
        for (var key in this._localState) {
            // Reset to global state
            this._stateFuncs[key](this._globalState[key]);
        }
        this._localState = {};
    };

    /**
     * @function
     * @name pc.gfx.Device#getCurrentState
     * @author Will Eastcott
     */
    Device.prototype.getCurrentState = function () {
        return this._currentState;
    };

    /**
     * @function
     * @name pc.gfx.Device#setRenderTarget
     * @author Will Eastcott
     */
    Device.prototype.setRenderTarget = function (renderTarget) {
        this.renderTarget = renderTarget;
    };

    /**
     * @function
     * @name pc.gfx.Device#getRenderTarget
     * @author Will Eastcott
     */
    Device.prototype.getRenderTarget = function () {
        return this.renderTarget;
    };

    /**
     * @function
     * @name pc.gfx.Device#setIndexBuffer
     * @author Will Eastcott
     */
    Device.prototype.setIndexBuffer = function (indexBuffer) {
        // Store the index buffer
        this.indexBuffer = indexBuffer

        // Set the active index buffer object
        var gl = this.gl;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer ? indexBuffer.bufferId : null);
    };

    /**
     * @function
     * @name pc.gfx.Device#setVertexBuffer
     * @author Will Eastcott
     */
    Device.prototype.setVertexBuffer = function (vertexBuffer, stream) {
        // Store the vertex buffer for this stream index
        this.vertexBuffers[stream] = vertexBuffer;

        // Push each vertex element in scope
        var vertexFormat = vertexBuffer.getFormat();
        var i = 0;
        var elements = vertexFormat.elements;
        var numElements = vertexFormat.numElements;
        while (i < numElements) {
            var vertexElement = elements[i++];
            vertexElement.stream = stream;
            vertexElement.scopeId.setValue(vertexElement);
        }
    };

    /**
     * @function
     * @name pc.gfx.Device#setProgram
     * @author Will Eastcott
     */
    Device.prototype.setProgram = function(program) {
        if (program !== this.program) {
            // Store the program
            this.program = program;

            // Set the active shader program
            var gl = this.gl;
            gl.useProgram(program.programId);
        }
    };

    /**
     * @function
     * @name pc.gfx.Device#commitAttributes
     * @author Will Eastcott
     */
    Device.prototype.commitAttributes = function (startVertex) {
        var i, len, attribute, element, vertexBuffer;
        var attributes = this.program.attributes;
        var gl = this.gl;

        for (i = 0, len = attributes.length; i < len; i++) {
            attribute = attributes[i];

            // Retrieve vertex element for this shader attribute
            element = attribute.scopeId.value;

            // Check the vertex element is valid
            if (element !== null) {
                // Retrieve the vertex buffer that contains this element
                vertexBuffer = this.vertexBuffers[element.stream];

                // Set the active vertex buffer object
                if (this.boundBuffer !== vertexBuffer.bufferId) {
                    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer.bufferId);
                    this.boundBuffer = vertexBuffer.bufferId;
                }

                // Hook the vertex buffer to the shader program
                gl.enableVertexAttribArray(attribute.locationId);
                gl.vertexAttribPointer(attribute.locationId, 
                                       element.numComponents, 
                                       this.lookup.elementType[element.dataType], 
                                       gl.FALSE,
                                       element.stride,
                                       startVertex * element.stride + element.offset);
            }
        }
    };

    /**
     * @function
     * @name pc.gfx.Device#commitUniforms
     * @author Will Eastcott
     */
    Device.prototype.commitUniforms = function () {
        var textureUnit = 0;
        var i, len, uniform;
        var uniforms = this.program.uniforms;
        var gl = this.gl;

        for (i = 0, len = uniforms.length; i < len; i++) {
            uniform = uniforms[i];

            // Check the value is valid
            if (uniform.scopeId.value != null) {

                // Handle textures differently, as its probably safer
                // to always set them rather than try to track which
                // one is currently set!
                if ((uniform.dataType === pc.gfx.ShaderInputType.TEXTURE2D) || 
                    (uniform.dataType === pc.gfx.ShaderInputType.TEXTURECUBE)) {
                    var texture = uniform.scopeId.value;

                    gl.activeTexture(gl.TEXTURE0 + textureUnit);
                    texture.bind();
                    gl.uniform1i(uniform.locationId, textureUnit);

                    textureUnit++;
                } else {
                    // Check if the value is out of date
                    if (uniform.version.notequals(uniform.scopeId.versionObject.version)) {

                        // Copy the version to track that its now up to date
                        uniform.version.copy(uniform.scopeId.versionObject.version);

                        // Retrieve value for this shader uniform
                        var value = uniform.scopeId.value;

                        // Call the function to commit the uniform value
                        this.commitFunction[uniform.dataType](uniform.locationId, value);
                    }
                }
            }
        }
    };

    /**
     * @function
     * @name pc.gfx.Device#getBoneLimit
     * @description Queries the maximum number of bones that can be referenced by a shader.
     * The shader generators (pc.gfx.programlib) use this number to specify the matrix array
     * size of the uniform 'matrix_pose[0]'. The value is calculated based on the number of 
     * available uniform vectors available after subtracting the number taken by a typical 
     * heavyweight shader. If a different number is required, it can be tuned via
     * pc.gfx.Device#setBoneLimit.
     * @returns {number} The maximum number of bones that can be supported by the host hardware.
     * @author Will Eastcott
     */
    Device.prototype.getBoneLimit = function () {
        return this.boneLimit;
    }

    /**
     * @function
     * @name pc.gfx.Device#setBoneLimit
     * @description
     * @param {number} maxBones The maximum number of bones supported by a draw command.
     * @author Will Eastcott
     */
    Device.prototype.setBoneLimit = function (maxBones) {
        this.boneLimit = maxBones;
    }

    /**
     * @function
     * @name pc.gfx.Device#enableValidation
     * @author Will Eastcott
     */
    Device.prototype.enableValidation = function (enable) {
        if (enable === true) {
            if (this.gl instanceof WebGLRenderingContext) {

                // Create a new WebGLValidator object to
                // usurp the real WebGL context
                this.gl = new WebGLValidator(this.gl);
            }
        } else {
            if (this.gl instanceof WebGLValidator) {

                // Unwrap the real WebGL context
                this.gl = Context.gl;
            }
        }
    };

    /**
     * @function
     * @name pc.gfx.Device#validate
     * @author Will Eastcott
     */
    Device.prototype.validate = function() {
        var gl = this.gl;
        var error = gl.getError();

        if (error !== gl.NO_ERROR) {
            Log.error("WebGL error: " + WebGLValidator.ErrorString[error]);
            return false;
        }

        return true;
    };

    return {
        Device: Device
    }; 
}());