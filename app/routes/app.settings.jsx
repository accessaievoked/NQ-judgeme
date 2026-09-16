// app/routes/app.settings.jsx
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
    await authenticate.admin(request);

    // Hardcoded for now — swap for a real DB read later
    return {
        widgetPosition: "below_price",
        accentColor: "#000000",
    };
};

export const action = async ({ request }) => {
    await authenticate.admin(request);
    const formData = await request.formData();

    // Not persisted yet — just confirming the submit works
    return {
        ok: true,
        widgetPosition: formData.get("widgetPosition"),
        accentColor: formData.get("accentColor"),
    };
};

export default function Settings() {
    const fetcher = useFetcher();
    const shopify = useAppBridge();

    const handleSubmit = (event) => {
        event.preventDefault();
        fetcher.submit(new FormData(event.target), { method: "POST" });
    };

    if (fetcher.data?.ok) {
        shopify.toast.show("Settings saved (not yet persisted)");
    }

    return (
        <s-page heading="Settings">
            <s-section heading="Widget appearance">
                <form onSubmit={handleSubmit}>
                    <s-stack direction="block" gap="base">
                        <s-paragraph>Hey there updates there</s-paragraph>
                        <s-select label="Widget position" name="widgetPosition">
                            <option value="below_price">Below price</option>
                            <option value="below_atc">Below add to cart</option>
                        </s-select>

                        <s-text-field
                            label="Accent color"
                            name="accentColor"
                            placeholder="#000000"
                        ></s-text-field>

                        <s-button type="submit">Save</s-button>
                    </s-stack>
                </form>
            </s-section>
        </s-page>
    );
}

export const headers = (headersArgs) => {
    return boundary.headers(headersArgs);
};