/* jshint strict: false */
/* global gl: true, Stats, createProgram, vec3, mat4 */
/* exported main */

var NUM_PARTICLES			= Math.pow(256, 2);
var NUM_SLOTS				= 2;
var PARTICLES_PER_ROW		= Math.sqrt(NUM_PARTICLES);
var STATE_TEXTURE_WIDTH		= PARTICLES_PER_ROW * NUM_SLOTS;
var STATE_TEXTURE_HEIGHT	= PARTICLES_PER_ROW;

function main() {
	var canvas = document.getElementById('webgl');
	gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
	if (!gl.getExtension('OES_texture_float')) {
		return;
	}

	gl.clearColor(0.0, 0.0, 0.0, 1.0);
	gl.enable(gl.DEPTH_TEST);

	// Stats
	var stats = new Stats();
	stats.domElement.style.position	= 'fixed';
	stats.domElement.style.right	= '20px';
	stats.domElement.style.top		= '20px';
	document.body.appendChild(stats.domElement);

	var program_phys = createProgram(
		document.getElementById('phys-vs').text,
		document.getElementById('phys-fs').text);
	var program_calc = createProgram(
		document.getElementById('calc-vs').text,
		document.getElementById('calc-fs').text);
	var program_draw = createProgram(
		document.getElementById('draw-vs').text,
		document.getElementById('draw-fs').text);

	// Uniforms
	program_calc.u_dt		= gl.getUniformLocation(program_phys, 'u_dt');
	program_phys.u_viewport	= gl.getUniformLocation(program_phys, 'u_viewport');
	program_calc.u_viewport	= gl.getUniformLocation(program_calc, 'u_viewport');

	program_phys.u_state	= gl.getUniformLocation(program_phys, 'u_state');
	program_calc.u_state	= gl.getUniformLocation(program_calc, 'u_state');
	program_calc.u_dot		= gl.getUniformLocation(program_calc, 'u_dot');
	program_draw.u_state	= gl.getUniformLocation(program_draw, 'u_state');

	program_draw.u_vp		= gl.getUniformLocation(program_draw, 'u_vp');

	gl.useProgram(program_phys);
	gl.uniform2f(program_phys.u_viewport, STATE_TEXTURE_WIDTH, STATE_TEXTURE_HEIGHT);
	gl.useProgram(program_calc);
	gl.uniform2f(program_calc.u_viewport, STATE_TEXTURE_WIDTH, STATE_TEXTURE_HEIGHT);

	// Attributes
	program_phys.a_rectangle = gl.getAttribLocation(program_phys, 'a_rectangle');
	program_calc.a_rectancle = gl.getAttribLocation(program_calc, 'a_rectangle');
	program_draw.a_reference = gl.getAttribLocation(program_draw, 'a_reference');

	var initial_state = new Float32Array(4 * NUM_PARTICLES * NUM_SLOTS);

	for (var i = 0; i < NUM_PARTICLES; i++) {
		initial_state[i * 8 + 4] = (Math.random() - 0.5) / 100.0;
		initial_state[i * 8 + 5] = (Math.random() - 0.5) / 100.0;
		initial_state[i * 8 + 6] = (Math.random() - 0.5) / 100.0;
	}

	// Camera
	var eye = vec3.create();
	vec3.set(eye, 2.0, 2.0, 2.0);
	var center = vec3.create();
	vec3.set(center, 0.0, 0.0, 0.0);
	var up = vec3.create();
	vec3.set(up, 0.0, 0.0, 1.0);
	var projection = mat4.create();
	mat4.perspective(projection, Math.PI / 3, gl.drawingBufferWidth/gl.drawingBufferHeight, 0.1, 100.0);
	var view = mat4.create();
	mat4.lookAt(view, eye, center, up);
	var vp = mat4.create();

	// Textures
	var texture_state = gl.createTexture();
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, texture_state);

	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, STATE_TEXTURE_WIDTH, STATE_TEXTURE_HEIGHT, 0, gl.RGBA, gl.FLOAT, initial_state);

	gl.useProgram(program_phys);
	gl.uniform1i(program_phys.u_state, 0);
	gl.useProgram(program_calc);
	gl.uniform1i(program_calc.u_state, 0);
	gl.useProgram(program_draw);
	gl.uniform1i(program_draw.u_state, 0);

	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	var texture_dot = gl.createTexture();
	gl.activeTexture(gl.TEXTURE1);
	gl.bindTexture(gl.TEXTURE_2D, texture_dot);

	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, STATE_TEXTURE_WIDTH, STATE_TEXTURE_HEIGHT, 0, gl.RGBA, gl.FLOAT, initial_state);

	gl.useProgram(program_calc);
	gl.uniform1i(program_calc.u_dot, 1);

	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	// Framebuffers
	var fb_state = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, fb_state);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture_state, 0);

	var fb_dot = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, fb_dot);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture_dot, 0);

	var reference	= new Float32Array(NUM_PARTICLES * 2);
	var interval	= 1.0 / PARTICLES_PER_ROW;

	for (var i = 0; i < NUM_PARTICLES; i++) {
		reference[i * 2]		= interval * ~~(i % PARTICLES_PER_ROW);
		reference[i * 2 + 1]	= interval * ~~(i / PARTICLES_PER_ROW);
	}

	var buffer_reference = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer_reference);
	gl.bufferData(gl.ARRAY_BUFFER, reference, gl.STATIC_DRAW);
	gl.enableVertexAttribArray(program_draw.a_reference);

	// Make a rectangle that draws over the whole buffer
	var buffer_rectangle = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer_rectangle);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
		-1.0, -1.0,
		 1.0, -1.0,
		-1.0,  1.0,
		 1.0,  1.0,
	]), gl.STATIC_DRAW);
	gl.enableVertexAttribArray(program_phys.a_rectangle);
	gl.enableVertexAttribArray(program_calc.a_rectangle);

	gl.useProgram(program_draw);
	gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

	var last = Date.now();

	var frame = function() {
		var now	= Date.now();
		var dt	= (now - last) / 1000.0;
		last 	= now;

		stats.begin();

		// PHYSICS
		gl.viewport(0, 0, STATE_TEXTURE_WIDTH, STATE_TEXTURE_HEIGHT);
		gl.useProgram(program_phys);
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer_rectangle);
		gl.vertexAttribPointer(program_phys.a_rectangle, 2, gl.FLOAT, gl.FALSE, 0, 0);

		gl.bindFramebuffer(gl.FRAMEBUFFER, fb_dot);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

		// CALCULATION
		gl.viewport(0, 0, STATE_TEXTURE_WIDTH, STATE_TEXTURE_HEIGHT);
		gl.useProgram(program_calc);
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer_rectangle);
		gl.vertexAttribPointer(program_calc.a_rectangle, 2, gl.FLOAT, gl.FALSE, 0, 0);

		gl.uniform1f(program_calc.u_dt, dt);

		gl.bindFramebuffer(gl.FRAMEBUFFER, fb_state);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

		// DRAWING
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
		gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

		gl.useProgram(program_draw);

		mat4.rotateZ(view, view, dt);
		mat4.multiply(vp, projection, view);
		gl.uniformMatrix4fv(program_draw.u_vp, false, vp);

		gl.bindBuffer(gl.ARRAY_BUFFER, buffer_reference);
		gl.vertexAttribPointer(program_draw.a_reference, 2, gl.FLOAT, gl.FALSE, 0, 0);

		gl.drawArrays(gl.POINTS, 0, NUM_PARTICLES);

		stats.end();
		window.requestAnimationFrame(frame);
	};

	window.requestAnimationFrame(frame);
}