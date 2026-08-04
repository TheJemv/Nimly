/** @type {import('tailwindcss').Config} */
module.exports = {
    // Asegúrate de incluir la carpeta de componentes aquí 👇
    content: [
        "./app/**/*.{js,jsx,ts,tsx}",
        "./components/**/*.{js,jsx,ts,tsx}", // <-- ¡Esta línea es la clave!
        "./src/**/*.{js,jsx,ts,tsx}",        // Agrega esta si usas carpeta /src
    ],
    theme: {
        extend: {},
    },
    plugins: [],
};